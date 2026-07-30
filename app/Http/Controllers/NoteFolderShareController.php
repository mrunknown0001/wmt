<?php

namespace App\Http\Controllers;

use App\Models\Note;
use App\Models\NoteFolder;
use App\Models\NoteFolderShare;
use App\Models\User;
use App\Services\NoteShareNotifier;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Sharing a whole folder.
 *
 * Only the folder's owner manages this. Folders are personal filing, so there
 * is no admin role over one the way there is over a note — the alternative
 * would let a recipient re-share someone else's cabinet.
 */
class NoteFolderShareController extends Controller
{
    public function store(Request $request, NoteFolder $noteFolder): RedirectResponse
    {
        $this->assertOwned($request, $noteFolder);

        $data = $request->validate([
            'type' => ['required', Rule::in(array_keys(NoteFolderShare::TYPES))],
            'shareable_id' => ['required', 'integer'],
            'role' => ['required', Rule::in(Note::ROLES)],
        ]);

        $class = NoteFolderShare::classFor($data['type']);

        if (!$class::whereKey($data['shareable_id'])->exists()) {
            throw ValidationException::withMessages([
                'shareable_id' => 'That ' . $data['type'] . ' no longer exists.',
            ]);
        }

        if ($class === User::class && (int) $data['shareable_id'] === (int) $noteFolder->user_id) {
            throw ValidationException::withMessages([
                'shareable_id' => 'This folder already belongs to that person.',
            ]);
        }

        $share = NoteFolderShare::updateOrCreate(
            [
                'note_folder_id' => $noteFolder->id,
                'shareable_type' => $class,
                'shareable_id' => $data['shareable_id'],
            ],
            ['role' => $data['role']],
        );

        $notified = $share->wasRecentlyCreated
            ? NoteShareNotifier::folderShared($noteFolder, $class, (int) $data['shareable_id'], $data['role'], $request->user())
            : 0;

        return back()->with('success', $notified > 0
            ? 'Folder shared — ' . $notified . ' ' . str('person')->plural($notified) . ' notified.'
            : 'Folder shared.');
    }

    public function update(Request $request, NoteFolder $noteFolder, NoteFolderShare $share): RedirectResponse
    {
        $this->assertOwned($request, $noteFolder);
        $this->assertBelongs($noteFolder, $share);

        $data = $request->validate([
            'role' => ['required', Rule::in(Note::ROLES)],
        ]);

        $share->update(['role' => $data['role']]);

        return back()->with('success', 'Access updated.');
    }

    public function destroy(Request $request, NoteFolder $noteFolder, NoteFolderShare $share): RedirectResponse
    {
        $this->assertOwned($request, $noteFolder);
        $this->assertBelongs($noteFolder, $share);

        $share->delete();

        return back()->with('success', 'Access removed.');
    }

    private function assertOwned(Request $request, NoteFolder $folder): void
    {
        abort_unless((int) $folder->user_id === (int) $request->user()->id, 403);
    }

    private function assertBelongs(NoteFolder $folder, NoteFolderShare $share): void
    {
        abort_unless((int) $share->note_folder_id === (int) $folder->id, 404);
    }
}
