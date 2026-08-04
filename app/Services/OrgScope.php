<?php

namespace App\Services;

use App\Models\Department;
use App\Models\Division;
use App\Models\Team;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Which parts of the organisation a person may look at.
 *
 * The rule follows the org chart downwards: you see the unit you head and
 * everything beneath it, never sideways and never up. A division head reaches
 * the departments and teams inside their division; a department head reaches
 * the teams inside theirs; a team leader reaches their team.
 *
 * Roles are additive. Somebody who heads a department and also leads a team in
 * a different one gets both, because they are genuinely responsible for both.
 */
class OrgScope
{
    /** True for people who oversee the whole organisation. */
    public static function seesEverything(User $user): bool
    {
        return $user->can('manage-users')
            || $user->hasRole('admin')
            || $user->hasRole('executive');
    }

    /**
     * The units this person may filter by.
     *
     * @return array{divisions: Collection, departments: Collection, teams: Collection}
     */
    public static function visibleUnits(User $user): array
    {
        if (self::seesEverything($user)) {
            return [
                'divisions' => Division::orderBy('name')->get(['id', 'name']),
                'departments' => Department::orderBy('name')->get(['id', 'name', 'division_id']),
                'teams' => Team::orderBy('name')->get(['id', 'name', 'department_id']),
            ];
        }

        // Divisions they head, and everything under them.
        $divisions = Division::where('head_id', $user->id)->orderBy('name')->get(['id', 'name']);

        $departments = Department::query()
            ->where(function ($q) use ($user, $divisions) {
                $q->where('head_id', $user->id);

                if ($divisions->isNotEmpty()) {
                    $q->orWhereIn('division_id', $divisions->pluck('id'));
                }
            })
            ->orderBy('name')
            ->get(['id', 'name', 'division_id']);

        $teams = Team::query()
            ->where(function ($q) use ($user, $departments) {
                $q->where('leader_id', $user->id);

                if ($departments->isNotEmpty()) {
                    $q->orWhereIn('department_id', $departments->pluck('id'));
                }
            })
            ->orderBy('name')
            ->get(['id', 'name', 'department_id']);

        // A team leader whose team sits in a department they do not head still
        // needs that department named, or their team would appear under a
        // heading that isn't there.
        return [
            'divisions' => $divisions,
            'departments' => $departments,
            'teams' => $teams,
        ];
    }

    /**
     * Narrow a requested selection to what the person is actually allowed.
     *
     * The browser can post any ids it likes, so the selection is intersected
     * with the visible set rather than trusted.
     *
     * @return array{divisions: array, departments: array, teams: array}
     */
    public static function permitted(User $user, array $requested): array
    {
        $visible = self::visibleUnits($user);

        $allow = fn (string $key) => collect($requested[$key] ?? [])
            ->map(fn ($id) => (int) $id)
            ->filter()
            ->intersect($visible[$key]->pluck('id'))
            ->values()
            ->all();

        return [
            'divisions' => $allow('divisions'),
            'departments' => $allow('departments'),
            'teams' => $allow('teams'),
        ];
    }

    /**
     * The people inside a selection of org units.
     *
     * A division holds no one directly — its people are reached through its
     * departments, and a team's members through the team. Selecting a division
     * therefore means everybody beneath it, which is what someone picking a
     * division expects to see.
     *
     * @return Collection<int, int> user ids
     */
    public static function usersIn(array $selection): Collection
    {
        $departmentIds = collect($selection['departments'] ?? [])->map(fn ($id) => (int) $id);

        if (!empty($selection['divisions'])) {
            $departmentIds = $departmentIds->merge(
                Department::whereIn('division_id', $selection['divisions'])->pluck('id')
            );
        }

        $departmentIds = $departmentIds->unique();
        $teamIds = collect($selection['teams'] ?? [])->map(fn ($id) => (int) $id)->unique();

        if ($departmentIds->isEmpty() && $teamIds->isEmpty()) {
            return collect();
        }

        return User::query()
            ->where('is_active', true)
            ->where(function ($q) use ($departmentIds, $teamIds) {
                if ($departmentIds->isNotEmpty()) {
                    $q->orWhereIn('department_id', $departmentIds)
                        // Somebody filed under a team but not a department still
                        // belongs to that department through their team.
                        ->orWhereIn('team_id', Team::whereIn('department_id', $departmentIds)->select('id'));
                }

                if ($teamIds->isNotEmpty()) {
                    $q->orWhereIn('team_id', $teamIds);
                }
            })
            ->pluck('id');
    }

    /** True when the person heads or leads anything at all. */
    public static function hasAnyScope(User $user): bool
    {
        if (self::seesEverything($user)) {
            return true;
        }

        $units = self::visibleUnits($user);

        return $units['divisions']->isNotEmpty()
            || $units['departments']->isNotEmpty()
            || $units['teams']->isNotEmpty();
    }

    /**
     * Everyone this person is responsible for, themselves included.
     *
     * The same downward walk as visibleUnits(), resolved to people: a team
     * leader gets their team, a department head gets their department and the
     * teams inside it, a division head gets the whole branch. Admins and
     * executives get everybody.
     *
     * Themselves, because someone arranging cover is usually either taking the
     * work on or handing their own out, and a leader is not always filed as a
     * member of the team they run.
     *
     * @return Collection<int, int> user ids
     */
    public static function manageablePeopleIds(User $user): Collection
    {
        if (self::seesEverything($user)) {
            return User::where('is_active', true)->pluck('id');
        }

        $units = self::visibleUnits($user);

        return self::usersIn([
            'divisions' => $units['divisions']->pluck('id')->all(),
            'departments' => $units['departments']->pluck('id')->all(),
            'teams' => $units['teams']->pluck('id')->all(),
        ])->push($user->id)->unique()->values();
    }

    /**
     * The same people, as records ready for a picker.
     *
     * @return Collection<int, User>
     */
    public static function manageablePeople(User $user): Collection
    {
        return User::whereIn('id', self::manageablePeopleIds($user))
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name']);
    }

    /** Whether this person may act on that one, by position in the org chart. */
    public static function manages(User $user, int $subjectId): bool
    {
        return self::manageablePeopleIds($user)->contains($subjectId);
    }
}
