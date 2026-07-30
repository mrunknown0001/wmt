<?php

namespace App\Http\Controllers;

use App\Models\Note;
use App\Models\NoteFolder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class NoteFolderController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'parent_id' => ['nullable', 'integer'],
        ]);

        $parent = $this->ownedFolder($request, $data['parent_id'] ?? null);

        if ($parent && $parent->depth() >= NoteFolder::MAX_DEPTH) {
            throw ValidationException::withMessages([
                'parent_id' => 'Folders can only be nested ' . (NoteFolder::MAX_DEPTH + 1) . ' levels deep.',
            ]);
        }

        NoteFolder::create([
            'user_id' => $request->user()->id,
            'name' => $data['name'],
            'parent_id' => $parent?->id,
            'position' => (int) NoteFolder::where('user_id', $request->user()->id)->max('position') + 1,
        ]);

        return back()->with('success', 'Folder created.');
    }

    public function update(Request $request, NoteFolder $noteFolder): RedirectResponse
    {
        $this->assertOwned($request, $noteFolder);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'parent_id' => ['nullable', 'integer'],
        ]);

        $parentId = $this->ownedFolder($request, $data['parent_id'] ?? null)?->id;

        if ($noteFolder->wouldCycle($parentId)) {
            throw ValidationException::withMessages([
                'parent_id' => 'A folder cannot be moved inside itself.',
            ]);
        }

        $noteFolder->update([
            'name' => $data['name'],
            'parent_id' => $parentId,
        ]);

        return back()->with('success', 'Folder renamed.');
    }

    /**
     * Delete the folder, keeping its contents.
     *
     * Notes move to "Unfiled" and subfolders move up to this folder's parent.
     * Deleting a container should not destroy what someone put inside it —
     * especially when notes here may be shared with other people.
     */
    public function destroy(Request $request, NoteFolder $noteFolder): RedirectResponse
    {
        $this->assertOwned($request, $noteFolder);

        Note::where('note_folder_id', $noteFolder->id)->update(['note_folder_id' => null]);
        NoteFolder::where('parent_id', $noteFolder->id)->update(['parent_id' => $noteFolder->parent_id]);

        $noteFolder->delete();

        return redirect('/notes')->with('success', 'Folder deleted. Its notes moved to Unfiled.');
    }

    private function assertOwned(Request $request, NoteFolder $folder): void
    {
        abort_unless((int) $folder->user_id === (int) $request->user()->id, 403);
    }

    private function ownedFolder(Request $request, $id): ?NoteFolder
    {
        if (!$id) {
            return null;
        }

        return NoteFolder::where('user_id', $request->user()->id)->find($id);
    }
}
