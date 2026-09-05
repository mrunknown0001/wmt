<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ScopesVisibleWork;
use App\Models\Project;
use App\Models\Tag;
use App\Models\Task;
use App\Models\TaskMinute;
use App\Models\User;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The labels, and everything filed under one.
 *
 * Choosing a tag in the search box used to re-run the search with the label as
 * the term, which looked from the outside like nothing happening: the same
 * dropdown, slightly different rows. A label is a place, so choosing one now
 * goes there — the whole of it, not the five rows a dropdown has room for.
 */
class TagBrowseController extends Controller
{
    use ScopesVisibleWork;

    /** Enough of a long list to be useful without becoming a report. */
    private const PER_SECTION = 50;

    public function index(Request $request): Response
    {
        $user = $request->user();
        $q = trim((string) $request->query('q', ''));

        $tags = Tag::query()
            ->when($q !== '', fn ($query) => $query->where('name', 'like', '%' . $q . '%'))
            ->withCount(['projects', 'tasks', 'minutes'])
            ->orderBy('name')
            ->get()
            ->map(fn (Tag $tag) => [
                'id' => $tag->id,
                'name' => $tag->name,
                'slug' => $tag->slug,
                'uses' => $tag->projects_count + $tag->tasks_count + $tag->minutes_count,
            ])
            ->filter(fn ($tag) => $tag['uses'] > 0)
            ->values();

        // Which label the page is showing. The word typed is usually the label
        // wanted — from a chip, it is exactly the label — so an exact match
        // opens it, and so does being the only thing left after filtering.
        $selected = null;

        if ($q !== '') {
            $slug = Tag::slugFor($q);
            $selected = $tags->firstWhere('slug', $slug) ?? ($tags->count() === 1 ? $tags->first() : null);
        }

        return Inertia::render('Tags/Index', [
            'tags' => $tags,
            'filter' => $q,
            'selected' => $selected,
            'results' => $selected ? $this->resultsFor($user, $selected['slug']) : null,
        ]);
    }

    /** Everything carrying one label that this person may see. */
    private function resultsFor(User $user, string $slug): array
    {
        $tagged = fn ($query) => $query->whereHas('tags', fn ($t) => $t->where('slug', $slug));

        $projects = Project::query()->tap($tagged);
        $this->scopeVisibleProjects($projects, $user);

        $tasks = Task::query()->tap($tagged);
        $this->scopeVisibleTasks($tasks, $user);

        $minutes = TaskMinute::query()->tap($tagged);
        $this->scopeVisibleMinutes($minutes, $user);

        return [
            'projects' => [
                'total' => (clone $projects)->count(),
                'rows' => $projects->with(['owner:id,name', 'tags:id,name,slug'])
                    ->orderBy('name')->take(self::PER_SECTION)->get()
                    ->map(fn (Project $p) => [
                        'id' => $p->id,
                        'name' => $p->name,
                        'status' => $p->status,
                        'owner' => $p->owner?->name,
                        'tags' => $p->tags->pluck('name'),
                        'url' => "/projects/{$p->id}",
                    ]),
            ],
            'tasks' => [
                'total' => (clone $tasks)->count(),
                'rows' => $tasks->with(['project:id,name', 'assignee:id,name', 'tags:id,name,slug'])
                    ->orderBy('updated_at', 'desc')->take(self::PER_SECTION)->get()
                    ->map(fn (Task $t) => [
                        'id' => $t->id,
                        'title' => $t->title,
                        'status' => $t->status,
                        'priority' => $t->priority,
                        'series_number' => $t->series_number,
                        'project_name' => $t->project?->name,
                        'assignee' => $t->assignee?->name,
                        'tags' => $t->tags->pluck('name'),
                        'url' => $t->project_id
                            ? "/projects/{$t->project_id}/tasks/{$t->id}/edit"
                            : "/tasks/{$t->id}/edit",
                    ]),
            ],
            'minutes' => [
                'total' => (clone $minutes)->count(),
                'rows' => $minutes->with(['task:id,title,project_id', 'task.project:id,name', 'tags:id,name,slug'])
                    ->orderBy('meeting_date', 'desc')->take(self::PER_SECTION)->get()
                    ->map(fn (TaskMinute $m) => [
                        'id' => $m->id,
                        'title' => $m->meeting_title ?: ($m->task?->title ?? 'Minutes'),
                        'meeting_date' => $m->meeting_date?->toDateString(),
                        'task_title' => $m->task?->title,
                        'project_name' => $m->task?->project?->name,
                        'tags' => $m->tags->pluck('name'),
                        'url' => $m->task?->project_id
                            ? "/projects/{$m->task->project_id}/tasks/{$m->task_id}/edit"
                            : "/tasks/{$m->task_id}/edit",
                    ]),
            ],
        ];
    }
}
