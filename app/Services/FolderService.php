<?php

namespace App\Services;

use App\Models\Department;
use App\Models\Division;
use App\Models\Folder;
use App\Models\Project;
use App\Models\Team;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class FolderService
{
    /** @var array<int, Collection<int, int>> */
    private static array $overseenCache = [];

    /** @var array<int, Collection<int, int>> */
    private static array $visibleCache = [];

    /**
     * IDs of all folders whose contents the user oversees by org position:
     * the folder subtrees of divisions/departments they head and teams they lead.
     */
    public static function overseenFolderIds(User $user): Collection
    {
        if (isset(self::$overseenCache[$user->id])) {
            return self::$overseenCache[$user->id];
        }

        $roots = Folder::where(function ($q) use ($user) {
            $q->orWhere(function ($q) use ($user) {
                $q->where('source_type', Division::class)
                    ->whereIn('source_id', Division::where('head_id', $user->id)->select('id'));
            })->orWhere(function ($q) use ($user) {
                $q->where('source_type', Department::class)
                    ->whereIn('source_id', Department::where('head_id', $user->id)->select('id'));
            })->orWhere(function ($q) use ($user) {
                $q->where('source_type', Team::class)
                    ->whereIn('source_id', Team::where('leader_id', $user->id)->select('id'));
            });
        })->get(['id', 'path']);

        if ($roots->isEmpty()) {
            return self::$overseenCache[$user->id] = collect();
        }

        $ids = Folder::where(function ($q) use ($roots) {
            foreach ($roots as $root) {
                $q->orWhere('path', 'like', $root->path . '%');
            }
        })->pluck('id');

        return self::$overseenCache[$user->id] = $ids;
    }

    /**
     * IDs of folders the user may see in the tree (and file projects into):
     * everything for project managers; otherwise their own org chain, subtrees
     * they oversee, folders they created, folders holding projects they can
     * see — plus all ancestors so the tree can render the way down.
     */
    public static function visibleFolderIds(User $user): Collection
    {
        if (isset(self::$visibleCache[$user->id])) {
            return self::$visibleCache[$user->id];
        }

        if ($user->hasPermissionTo('manage-projects')) {
            return self::$visibleCache[$user->id] = Folder::pluck('id');
        }

        $direct = self::overseenFolderIds($user)->collect();

        // Own org chain: team and department system folders
        $chainQuery = Folder::query()->whereRaw('1 = 0');
        if ($user->team_id) {
            $chainQuery->orWhere(fn ($q) => $q->where('source_type', Team::class)->where('source_id', $user->team_id));
        }
        if ($user->department_id) {
            $chainQuery->orWhere(fn ($q) => $q->where('source_type', Department::class)->where('source_id', $user->department_id));
        }
        $direct = $direct->merge($chainQuery->pluck('id'));

        // Folders the user created
        $direct = $direct->merge(Folder::where('created_by', $user->id)->pluck('id'));

        // Folders holding projects the user can see
        $direct = $direct->merge(
            Project::whereNotNull('folder_id')
                ->where(function ($q) use ($user) {
                    $q->where('owner_id', $user->id)
                        ->orWhereHas('members', fn ($m) => $m->where('users.id', $user->id))
                        ->orWhereHas('tasks', fn ($t) => $t->where('assigned_to', $user->id));
                })
                ->distinct()
                ->pluck('folder_id')
        );

        // Expand with ancestors (each path contains the full ancestor id chain)
        $direct = $direct->unique();
        $visible = collect();
        Folder::whereIn('id', $direct)->pluck('path')->each(function ($path) use ($visible) {
            foreach (array_filter(explode('/', $path)) as $id) {
                $visible->push((int) $id);
            }
        });

        return self::$visibleCache[$user->id] = $visible->unique()->values();
    }

    public static function syncDivision(Division $division): Folder
    {
        return self::syncSystemFolder($division, null, 0);
    }

    public static function syncDepartment(Department $department): Folder
    {
        $divisionFolder = self::syncDivision($department->division()->firstOrFail());

        return self::syncSystemFolder($department, $divisionFolder, 1);
    }

    public static function syncTeam(Team $team): Folder
    {
        $departmentFolder = self::syncDepartment($team->department()->firstOrFail());

        return self::syncSystemFolder($team, $departmentFolder, 2);
    }

    private static function syncSystemFolder($entity, ?Folder $parent, int $depth): Folder
    {
        $folder = Folder::where('source_type', get_class($entity))
            ->where('source_id', $entity->id)
            ->first();

        if (!$folder) {
            return Folder::create([
                'name' => $entity->name,
                'parent_id' => $parent?->id,
                'depth' => $depth,
                'user_depth' => null,
                'source_type' => get_class($entity),
                'source_id' => $entity->id,
            ]);
        }

        if ($folder->name !== $entity->name) {
            $folder->update(['name' => $entity->name]);
        }

        if ($folder->parent_id !== $parent?->id) {
            $folder->moveTo($parent);
        }

        return $folder;
    }

    /**
     * Remove the system folder for a deleted org entity. Org deletes cascade at the
     * DB level (division -> departments -> teams), so this cleans the entire system
     * folder subtree: user folders and projects inside are promoted to the removed
     * folder's parent (or the root) instead of being deleted.
     */
    public static function removeFor(string $sourceType, int $sourceId): void
    {
        $folder = Folder::where('source_type', $sourceType)
            ->where('source_id', $sourceId)
            ->first();

        if (!$folder) {
            return;
        }

        DB::transaction(function () use ($folder) {
            $parent = $folder->parent;

            $systemIds = Folder::where('path', 'like', $folder->path . '%')
                ->whereNotNull('source_type')
                ->pluck('id');

            // Promote user folders sitting directly under any doomed system folder
            $userRoots = Folder::whereIn('parent_id', $systemIds)
                ->whereNull('source_type')
                ->get();

            foreach ($userRoots as $userFolder) {
                $userFolder->moveTo($parent);
            }

            Project::whereIn('folder_id', $systemIds)
                ->update(['folder_id' => $parent?->id]);

            // Remaining subtree is system folders only; FK cascade clears descendants
            $folder->delete();
        });
    }
}
