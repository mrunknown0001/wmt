<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Services\TaskDependencyService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

/**
 * "This task waits on that one."
 *
 * Two things are load-bearing: the graph cannot be made nonsensical (no loops,
 * no self-reference, no reaching into another project), and a task with
 * unfinished dependencies cannot be closed by ANY path — the guard lives in the
 * model's saving() hook precisely so the kanban drag, the API, bulk update and
 * automation all obey it without each remembering to ask.
 */
class TaskDependencyTest extends TestCase
{
    use RefreshDatabase;

    private function manager(): User
    {
        Permission::findOrCreate('manage-tasks');
        $u = User::factory()->create(['is_active' => true]);
        $u->givePermissionTo('manage-tasks');
        return $u;
    }

    private function task(Project $p, string $title, string $status = 'to_do'): Task
    {
        return Task::factory()->create(['project_id' => $p->id, 'title' => $title, 'status' => $status]);
    }

    // ------------------------------------------------------------ the graph

    public function test_a_task_cannot_depend_on_itself(): void
    {
        $t = $this->task(Project::factory()->create(), 'Only task');

        $this->expectException(ValidationException::class);
        TaskDependencyService::add($t, $t->id);
    }

    public function test_a_dependency_must_be_in_the_same_project(): void
    {
        $mine = $this->task(Project::factory()->create(), 'Mine');
        $theirs = $this->task(Project::factory()->create(), 'Theirs');

        $this->expectException(ValidationException::class);
        TaskDependencyService::add($mine, $theirs->id);
    }

    public function test_a_direct_loop_is_refused(): void
    {
        $p = Project::factory()->create();
        $a = $this->task($p, 'A');
        $b = $this->task($p, 'B');
        TaskDependencyService::add($a, $b->id);

        $this->expectException(ValidationException::class);
        TaskDependencyService::add($b, $a->id);   // B waits on A, A already waits on B
    }

    public function test_an_indirect_loop_is_refused(): void
    {
        // A -> B -> C, then C -> A would close a ring in which nothing could
        // ever be completed. The direct check alone would not catch this.
        $p = Project::factory()->create();
        $a = $this->task($p, 'A');
        $b = $this->task($p, 'B');
        $c = $this->task($p, 'C');
        TaskDependencyService::add($a, $b->id);
        TaskDependencyService::add($b, $c->id);

        $this->expectException(ValidationException::class);
        TaskDependencyService::add($c, $a->id);
    }

    public function test_the_same_edge_twice_is_harmless(): void
    {
        $p = Project::factory()->create();
        $a = $this->task($p, 'A');
        $b = $this->task($p, 'B');

        TaskDependencyService::add($a, $b->id);
        TaskDependencyService::add($a, $b->id);   // impatient double-click

        $this->assertSame(1, $a->fresh()->dependencies()->count());
    }

    // ---------------------------------------------------------- the blocking

    public function test_a_task_cannot_be_closed_while_a_dependency_is_open(): void
    {
        $p = Project::factory()->create();
        $blocker = $this->task($p, 'Survey sign-off', 'in_progress');
        $waiting = $this->task($p, 'Order units');
        TaskDependencyService::add($waiting, $blocker->id);

        try {
            $waiting->update(['status' => 'done']);
            $this->fail('Expected the close to be refused.');
        } catch (ValidationException $e) {
            $this->assertStringContainsString('Survey sign-off', $e->getMessage());
        }

        $this->assertSame('to_do', $waiting->fresh()->status);
    }

    public function test_it_closes_once_the_dependency_is_done(): void
    {
        $p = Project::factory()->create();
        $blocker = $this->task($p, 'Survey sign-off');
        $waiting = $this->task($p, 'Order units');
        TaskDependencyService::add($waiting, $blocker->id);

        $blocker->update(['status' => 'done']);
        $waiting->update(['status' => 'done']);

        $this->assertSame('done', $waiting->fresh()->status);
    }

    public function test_a_cancelled_dependency_does_not_block_forever(): void
    {
        // Otherwise cancelling one task would deadlock everything downstream.
        $p = Project::factory()->create();
        $blocker = $this->task($p, 'Abandoned survey');
        $waiting = $this->task($p, 'Order units');
        TaskDependencyService::add($waiting, $blocker->id);

        $blocker->update(['status' => 'cancelled']);
        $waiting->update(['status' => 'done']);

        $this->assertSame('done', $waiting->fresh()->status);
    }

    public function test_the_block_applies_to_the_patch_endpoint_too(): void
    {
        // The point of guarding in saving() rather than a controller.
        $user = $this->manager();
        $p = Project::factory()->create();
        $blocker = $this->task($p, 'Survey sign-off');
        $waiting = $this->task($p, 'Order units');
        TaskDependencyService::add($waiting, $blocker->id);

        $this->actingAs($user)
            ->patchJson("/projects/{$p->id}/tasks/{$waiting->id}/patch", ['status' => 'done'])
            ->assertStatus(422);

        $this->assertSame('to_do', $waiting->fresh()->status);
    }

    public function test_an_unrelated_status_change_is_unaffected(): void
    {
        $p = Project::factory()->create();
        $blocker = $this->task($p, 'Survey sign-off');
        $waiting = $this->task($p, 'Order units');
        TaskDependencyService::add($waiting, $blocker->id);

        $waiting->update(['status' => 'in_progress']);

        $this->assertSame('in_progress', $waiting->fresh()->status);
    }
}
