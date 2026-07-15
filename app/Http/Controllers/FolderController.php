<?php

namespace App\Http\Controllers;

use App\Models\Folder;
use App\Services\ActivityLogger;
use App\Services\FolderService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FolderController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $this->authorize('create', Folder::class);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'parent_id' => 'nullable|exists:folders,id',
        ]);

        $parent = !empty($validated['parent_id']) ? Folder::find($validated['parent_id']) : null;

        if ($parent && !FolderService::visibleFolderIds($request->user())->contains($parent->id)) {
            return back()->withErrors(['parent_id' => 'You do not have access to that folder.']);
        }

        $userDepth = Folder::userDepthUnder($parent);
        if ($userDepth > Folder::MAX_USER_DEPTH) {
            return back()->withErrors(['parent_id' => 'Maximum folder depth reached (5 levels).']);
        }

        $folder = Folder::create([
            'name' => $validated['name'],
            'parent_id' => $parent?->id,
            'depth' => $parent ? $parent->depth + 1 : 0,
            'user_depth' => $userDepth,
            'created_by' => $request->user()->id,
            'position' => (Folder::where('parent_id', $parent?->id)->max('position') ?? -1) + 1,
        ]);

        ActivityLogger::logCreated($folder, $request->user());

        return back()->with('success', 'Folder created.');
    }

    public function update(Request $request, Folder $folder): RedirectResponse
    {
        $this->authorize('update', $folder);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
        ]);

        $oldValues = $folder->only(['name', 'parent_id']);

        $folder->update(['name' => $validated['name']]);

        ActivityLogger::logChanges($folder, $oldValues, $request->user());

        return back()->with('success', 'Folder renamed.');
    }

    public function move(Request $request, Folder $folder): RedirectResponse
    {
        $this->authorize('update', $folder);

        $validated = $request->validate([
            'parent_id' => 'nullable|exists:folders,id',
        ]);

        $newParent = !empty($validated['parent_id']) ? Folder::find($validated['parent_id']) : null;

        if ($newParent && !FolderService::visibleFolderIds($request->user())->contains($newParent->id)) {
            return back()->withErrors(['parent_id' => 'You do not have access to that folder.']);
        }

        if ($newParent && ($newParent->id === $folder->id || $folder->isAncestorOf($newParent))) {
            return back()->withErrors(['parent_id' => 'A folder cannot be moved inside itself.']);
        }

        $newUserDepth = Folder::userDepthUnder($newParent);
        $subtreeMaxUserDepth = max(
            $folder->user_depth,
            $folder->descendants()->max('user_depth') ?? $folder->user_depth
        );

        if ($subtreeMaxUserDepth + ($newUserDepth - $folder->user_depth) > Folder::MAX_USER_DEPTH) {
            return back()->withErrors(['parent_id' => 'Moving here would exceed the maximum folder depth (5 levels).']);
        }

        $oldValues = $folder->only(['name', 'parent_id']);

        $folder->moveTo($newParent);

        ActivityLogger::logChanges($folder, $oldValues, $request->user());

        return back()->with('success', 'Folder moved.');
    }

    public function destroy(Folder $folder): RedirectResponse
    {
        $this->authorize('delete', $folder);

        DB::transaction(function () use ($folder) {
            $parent = $folder->parent;

            // Contents are promoted to the parent folder, never deleted
            foreach ($folder->children()->get() as $child) {
                $child->moveTo($parent);
            }

            $folder->projects()->update(['folder_id' => $parent?->id]);

            ActivityLogger::logDeleted($folder, auth()->user());

            $folder->delete();
        });

        return back()->with('success', 'Folder deleted. Its contents were moved to the parent folder.');
    }
}
