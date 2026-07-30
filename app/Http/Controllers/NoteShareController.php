<?php

namespace App\Http\Controllers;

use App\Models\Note;
use App\Models\NoteShare;
use App\Services\NoteShareNotifier;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class NoteShareController extends Controller
{
    public function store(Request $request, Note $note): RedirectResponse
    {
        $this->authorize('manageShares', $note);

        $data = $request->validate([
            'type' => ['required', Rule::in(array_keys(NoteShare::TYPES))],
            'shareable_id' => ['required', 'integer'],
            'role' => ['required', Rule::in(Note::ROLES)],
        ]);

        $class = NoteShare::classFor($data['type']);

        // Confirm the audience exists before storing a share pointing at nothing.
        if (!$class::whereKey($data['shareable_id'])->exists()) {
            throw ValidationException::withMessages([
                'shareable_id' => 'That ' . $data['type'] . ' no longer exists.',
            ]);
        }

        // Sharing a note with its own owner would put a role beside ownership
        // and imply it could be reduced. It cannot.
        if ($class === \App\Models\User::class && (int) $data['shareable_id'] === (int) $note->user_id) {
            throw ValidationException::withMessages([
                'shareable_id' => 'This note already belongs to that person.',
            ]);
        }

        // updateOrCreate rather than create: re-sharing with the same audience
        // changes the role instead of failing on the unique index.
        $share = NoteShare::updateOrCreate(
            [
                'note_id' => $note->id,
                'shareable_type' => $class,
                'shareable_id' => $data['shareable_id'],
            ],
            ['role' => $data['role']],
        );

        // Only announce a share the first time. Nudging a division again
        // because someone changed a role from viewer to editor would be noise.
        $notified = $share->wasRecentlyCreated
            ? NoteShareNotifier::noteShared($note, $class, (int) $data['shareable_id'], $data['role'], $request->user())
            : 0;

        return back()->with('success', $notified > 0
            ? 'Note shared — ' . $notified . ' ' . str('person')->plural($notified) . ' notified.'
            : 'Note shared.');
    }

    public function update(Request $request, Note $note, NoteShare $share): RedirectResponse
    {
        $this->authorize('manageShares', $note);
        $this->assertBelongs($note, $share);

        $data = $request->validate([
            'role' => ['required', Rule::in(Note::ROLES)],
        ]);

        $share->update(['role' => $data['role']]);

        return back()->with('success', 'Access updated.');
    }

    public function destroy(Request $request, Note $note, NoteShare $share): RedirectResponse
    {
        $this->authorize('manageShares', $note);
        $this->assertBelongs($note, $share);

        $share->delete();

        return back()->with('success', 'Access removed.');
    }

    /**
     * A share id from another note would otherwise be editable by anyone who
     * administers this one.
     */
    private function assertBelongs(Note $note, NoteShare $share): void
    {
        abort_unless((int) $share->note_id === (int) $note->id, 404);
    }
}
