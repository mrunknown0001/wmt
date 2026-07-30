<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\Division;
use App\Models\Note;
use App\Models\NoteFolder;
use App\Models\NoteShare;
use App\Models\Team;
use App\Models\User;
use App\Services\NoteSearch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class NoteController extends Controller
{
    /** Which slice of the notebook the list is showing. */
    private const SCOPES = ['mine', 'shared', 'archived'];

    public function index(Request $request): Response
    {
        $user = $request->user();

        $scope = in_array($request->query('scope'), self::SCOPES, true)
            ? $request->query('scope')
            : 'mine';

        $term = trim((string) $request->query('q', ''));
        $folderId = $request->query('folder');

        $query = NoteSearch::visibleQuery($user)->with(['owner:id,name', 'folder:id,name']);

        match ($scope) {
            // "Shared with me" is everything reaching the user through a share
            // rather than through ownership.
            'shared' => $query->where('notes.user_id', '!=', $user->id)->notArchived(),
            'archived' => $query->archived(),
            default => $query->where('notes.user_id', $user->id)->notArchived(),
        };

        // Folders are the owner's own filing, so they only narrow their own notes.
        if ($folderId !== null && $folderId !== '' && $scope === 'mine') {
            $query->where('note_folder_id', $folderId === 'none' ? null : (int) $folderId);
        }

        NoteSearch::apply($query, $term);

        $notes = NoteSearch::rank($query->orderBy('updated_at', 'desc')->get(), $term)
            ->map(fn (Note $note) => $this->listPayload($note, $user));

        return Inertia::render('Notes/Index', [
            'notes' => $notes,
            'folders' => $this->folderTree($user),
            'scope' => $scope,
            'q' => $term,
            'activeFolder' => $folderId === null || $folderId === '' ? null : (string) $folderId,
            'counts' => $this->counts($user),
        ]);
    }

    public function create(Request $request): Response
    {
        $this->authorize('create', Note::class);

        return Inertia::render('Notes/Edit', [
            'note' => null,
            'folders' => $this->folderTree($request->user()),
            'defaultFolderId' => $request->query('folder') ?: null,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->authorize('create', Note::class);

        $data = $request->validate([
            'title' => ['nullable', 'string', 'max:255'],
            'content' => ['nullable', 'string', 'max:1000000'],
            'note_folder_id' => ['nullable', 'integer'],
        ]);

        $note = Note::create([
            'user_id' => $request->user()->id,
            'title' => trim($data['title'] ?? '') ?: 'Untitled note',
            'content' => $data['content'] ?? null,
            'note_folder_id' => $this->ownedFolderId($request->user(), $data['note_folder_id'] ?? null),
        ]);

        return redirect("/notes/{$note->id}/edit")->with('success', 'Note created.');
    }

    public function show(Request $request, Note $note): Response
    {
        $this->authorize('view', $note);

        return Inertia::render('Notes/Show', [
            'note' => $this->fullPayload($note, $request->user()),
        ]);
    }

    public function edit(Request $request, Note $note): Response
    {
        $this->authorize('update', $note);

        $user = $request->user();

        return Inertia::render('Notes/Edit', [
            'note' => $this->fullPayload($note, $user),
            'folders' => $this->folderTree($user),
            'defaultFolderId' => null,
        ]);
    }

    public function update(Request $request, Note $note): RedirectResponse
    {
        $this->authorize('update', $note);

        $data = $request->validate([
            'title' => ['nullable', 'string', 'max:255'],
            'content' => ['nullable', 'string', 'max:1000000'],
            'note_folder_id' => ['nullable', 'integer'],
        ]);

        $note->title = trim($data['title'] ?? '') ?: 'Untitled note';
        $note->content = $data['content'] ?? null;

        // Filing is the owner's business: an editor changing the content must
        // not be able to move the note out of the owner's folders.
        if (array_key_exists('note_folder_id', $data) && $request->user()->can('file', $note)) {
            $note->note_folder_id = $this->ownedFolderId($request->user(), $data['note_folder_id']);
        }

        $note->save();

        return back()->with('success', 'Note saved.');
    }

    /** Autosave from the editor — same rules as update(), no redirect. */
    public function autosave(Request $request, Note $note): JsonResponse
    {
        $this->authorize('update', $note);

        $data = $request->validate([
            'title' => ['nullable', 'string', 'max:255'],
            'content' => ['nullable', 'string', 'max:1000000'],
        ]);

        $note->update([
            'title' => trim($data['title'] ?? '') ?: 'Untitled note',
            'content' => $data['content'] ?? null,
        ]);

        return response()->json([
            'saved_at' => $note->updated_at?->toIso8601String(),
        ]);
    }

    public function archive(Request $request, Note $note): RedirectResponse
    {
        $this->authorize('archive', $note);

        $note->update(['archived_at' => now()]);

        return back()->with('success', 'Note archived.');
    }

    public function unarchive(Request $request, Note $note): RedirectResponse
    {
        $this->authorize('archive', $note);

        $note->update(['archived_at' => null]);

        return back()->with('success', 'Note restored from the archive.');
    }

    public function destroy(Request $request, Note $note): RedirectResponse
    {
        $this->authorize('delete', $note);

        $note->delete();

        return redirect('/notes')->with('success', 'Note deleted.');
    }

    /** The note as the list needs it — no body, since it never renders one. */
    private function listPayload(Note $note, User $user): array
    {
        $role = $note->roleFor($user);

        return [
            'id' => $note->id,
            'title' => $note->title,
            'excerpt' => $note->excerpt(),
            'snippet' => $note->getAttribute('search_snippet'),
            'folder' => $note->folder ? ['id' => $note->folder->id, 'name' => $note->folder->name] : null,
            'owner' => $note->owner?->name,
            'is_mine' => (int) $note->user_id === (int) $user->id,
            'archived' => $note->isArchived(),
            'role' => $role,
            'can_edit' => $note->canBeEditedBy($user),
            'can_administer' => $note->canBeAdministeredBy($user),
            'updated_at' => $note->updated_at?->toIso8601String(),
        ];
    }

    private function fullPayload(Note $note, User $user): array
    {
        $note->loadMissing(['owner:id,name', 'folder:id,name', 'shares.shareable']);

        return array_merge($this->listPayload($note, $user), [
            'content' => $note->content,
            'note_folder_id' => $note->note_folder_id,
            'can_manage_shares' => $user->can('manageShares', $note),
            'can_file' => $user->can('file', $note),
            'shares' => $note->shares->map(fn (NoteShare $share) => [
                'id' => $share->id,
                'type' => $share->typeKey(),
                'shareable_id' => $share->shareable_id,
                'name' => $share->shareable?->name ?? '(removed)',
                'role' => $share->role,
            ])->values(),
        ]);
    }

    /** The user's folders, flattened with a depth so the UI can indent them. */
    private function folderTree(User $user): array
    {
        $folders = NoteFolder::where('user_id', $user->id)
            ->withCount('notes')
            ->with('shares.shareable')
            ->orderBy('position')->orderBy('name')
            ->get();

        $byParent = $folders->groupBy('parent_id');

        $flatten = function ($parentId, int $depth) use (&$flatten, $byParent) {
            return collect($byParent[$parentId] ?? [])->flatMap(fn ($f) => array_merge(
                [[
                    'id' => $f->id,
                    'name' => $f->name,
                    'parent_id' => $f->parent_id,
                    'depth' => $depth,
                    'note_count' => $f->notes_count,
                    'shares' => $f->shares->map(fn ($share) => [
                        'id' => $share->id,
                        'type' => $share->typeKey(),
                        'shareable_id' => $share->shareable_id,
                        'name' => $share->shareable?->name ?? '(removed)',
                        'role' => $share->role,
                    ])->values(),
                ]],
                $flatten($f->id, $depth + 1)->all(),
            ));
        };

        return $flatten(null, 0)->all();
    }

    private function counts(User $user): array
    {
        return [
            'mine' => Note::where('user_id', $user->id)->notArchived()->count(),
            'shared' => Note::visibleTo($user)->where('notes.user_id', '!=', $user->id)->notArchived()->count(),
            'archived' => Note::visibleTo($user)->archived()->count(),
        ];
    }

    /** Reject a folder id that isn't the user's own, rather than trusting the form. */
    private function ownedFolderId(User $user, $folderId): ?int
    {
        if (!$folderId) {
            return null;
        }

        return NoteFolder::where('user_id', $user->id)->whereKey($folderId)->value('id');
    }

    /**
     * Audiences a note can be shared with, for the share picker.
     *
     * Only id and name — the picker has no need for emails or org internals.
     */
    public function shareOptions(Request $request): JsonResponse
    {
        return response()->json([
            'users' => User::where('is_active', true)
                ->where('id', '!=', $request->user()->id)
                ->orderBy('name')->get(['id', 'name']),
            'teams' => Team::orderBy('name')->get(['id', 'name']),
            'departments' => Department::orderBy('name')->get(['id', 'name']),
            'divisions' => Division::orderBy('name')->get(['id', 'name']),
        ]);
    }
}
