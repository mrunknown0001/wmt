<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Tag;
use App\Models\Task;
use App\Models\TaskMinute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Reading the vocabulary, and setting the labels on one record.
 *
 * One endpoint for all three kinds rather than three near-identical ones: what
 * changes between a project, a task and a minute is only which policy decides,
 * and that is a line of code, not a controller.
 */
class TagController extends Controller
{
    /** What may be tagged, and how to reach it. */
    private const TAGGABLE = [
        'project' => Project::class,
        'task' => Task::class,
        'minute' => TaskMinute::class,
    ];

    /**
     * The vocabulary, for the autocomplete.
     *
     * Ordered by use, so the labels people actually keep reaching for come
     * first and the one somebody coined last March does not head the list.
     */
    public function index(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));

        $tags = Tag::query()
            ->when($q !== '', fn ($query) => $query->where('name', 'like', '%' . $q . '%'))
            ->withCount(['projects', 'tasks', 'minutes'])
            ->get()
            ->map(fn (Tag $tag) => [
                'id' => $tag->id,
                'name' => $tag->name,
                'slug' => $tag->slug,
                'uses' => $tag->projects_count + $tag->tasks_count + $tag->minutes_count,
            ])
            ->sortByDesc('uses')
            ->take(20)
            ->values();

        return response()->json(['tags' => $tags]);
    }

    /** Set one record's labels to exactly what was sent. */
    public function update(Request $request, string $type, int $id): JsonResponse
    {
        $record = $this->find($type, $id);

        // Tagging is part of editing the thing, so it asks the same question
        // editing does rather than inventing a permission of its own — of
        // whichever record actually answers it.
        $this->authorize('update', $this->authority($record));

        $data = $request->validate([
            'tags' => ['present', 'array', 'max:20'],
            // Nullable because the framework turns a whitespace-only entry into
            // null before it gets here, and a blank tag is a thing to ignore
            // rather than a request to reject.
            'tags.*' => ['nullable', 'string', 'max:' . Tag::MAX_LENGTH],
        ]);

        $record->syncTagNames($data['tags'], $request->user()->id);

        return response()->json(['tags' => $record->fresh()->tags->map(fn (Tag $t) => [
            'id' => $t->id,
            'name' => $t->name,
            'slug' => $t->slug,
        ])]);
    }

    private function find(string $type, int $id): Model
    {
        abort_unless(isset(self::TAGGABLE[$type]), 404);

        $model = self::TAGGABLE[$type];

        return $model::findOrFail($id);
    }

    /**
     * The record whose policy decides.
     *
     * Usually the one being tagged. Minutes are the exception: they are part of
     * their task, have no policy of their own, and do not need one — whoever
     * may edit the task may label its minutes.
     */
    private function authority(Model $record): Model
    {
        if ($record instanceof TaskMinute) {
            return $record->task ?? abort(404);
        }

        return $record;
    }
}
