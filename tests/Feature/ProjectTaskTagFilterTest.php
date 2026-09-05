<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Labels reaching the project's task list.
 *
 * The filtering itself happens in the browser, over the tasks the page was
 * given — so what has to be true here is that every task arrives carrying its
 * labels, subtasks included, and without a query per row.
 */
class ProjectTaskTagFilterTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['manage-projects', 'manage-tasks', 'view-projects', 'view-tasks'] as $name) {
            Permission::findOrCreate($name);
        }
        Role::findOrCreate('admin')->syncPermissions(Permission::all());

        $this->owner = User::factory()->create(['is_active' => true]);
        $this->project = Project::create(['name' => 'Fit-out', 'status' => 'active', 'owner_id' => $this->owner->id]);
    }

    private function task(string $title, array $tags = [], ?Task $parent = null): Task
    {
        $task = Task::create([
            'project_id' => $this->project->id,
            'parent_id' => $parent?->id,
            'title' => $title,
            'status' => 'to_do',
            'priority' => 'medium',
            'assigned_to' => $this->owner->id,
        ]);

        if ($tags) {
            $task->syncTagNames($tags, $this->owner->id);
        }

        return $task;
    }

    public function test_every_task_arrives_with_its_labels(): void
    {
        $this->task('Install feed lines', ['Biosecurity', 'Urgent']);
        $this->task('Order units');

        $this->actingAs($this->owner)
            ->get("/projects/{$this->project->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('tasks', 2)
                ->has('tasks.0.tags', 2)
                ->where('tasks.0.tags.0.slug', 'biosecurity')
                ->has('tasks.1.tags', 0));
    }

    public function test_subtasks_carry_theirs_too(): void
    {
        $parent = $this->task('Fit the shed');
        $this->task('Run the conduit', ['Electrical'], $parent);

        $this->actingAs($this->owner)
            ->get("/projects/{$this->project->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('tasks.0.subtasks', 1)
                ->where('tasks.0.subtasks.0.tags.0.name', 'Electrical'));
    }

    public function test_the_labels_cost_one_query_rather_than_one_per_task(): void
    {
        foreach (range(1, 12) as $i) {
            $this->task("Task {$i}", ['Biosecurity']);
        }

        \Illuminate\Support\Facades\DB::enableQueryLog();

        $this->actingAs($this->owner)->get("/projects/{$this->project->id}")->assertOk();

        $tagQueries = collect(\Illuminate\Support\Facades\DB::getQueryLog())
            ->filter(fn ($q) => str_contains($q['query'], 'taggables'))
            ->count();

        \Illuminate\Support\Facades\DB::disableQueryLog();

        // One for the tasks, one for the subtasks, and one for the project's own
        // labels — not one per row.
        $this->assertLessThanOrEqual(3, $tagQueries, "tags cost {$tagQueries} queries");
    }

    public function test_somebody_who_only_sees_their_own_tasks_still_gets_the_labels(): void
    {
        // Not a member and not the owner: they reach the project through an
        // assigned task, and see only their own — the other branch of the
        // query, which needs the same labels loaded.
        $outsider = User::factory()->create(['is_active' => true]);

        $theirs = $this->task('Theirs', ['Biosecurity']);
        $theirs->update(['assigned_to' => $outsider->id]);
        $this->task('Not theirs', ['Urgent']);

        $this->actingAs($outsider)
            ->get("/projects/{$this->project->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('tasks', 1)
                ->where('tasks.0.title', 'Theirs')
                ->where('tasks.0.tags.0.name', 'Biosecurity'));
    }
}
