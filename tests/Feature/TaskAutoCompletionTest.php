<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A parent task finishes itself once its subtasks are all done.
 *
 * The percentage shown in the list is derived in the frontend; this covers the
 * half of the feature that changes state.
 */
class TaskAutoCompletionTest extends TestCase
{
    use RefreshDatabase;

    private function parentWithSubtasks(array $subtaskStatuses, string $parentStatus = 'in_progress'): Task
    {
        $project = Project::factory()->create();
        $parent = Task::factory()->create([
            'project_id' => $project->id,
            'status' => $parentStatus,
            'parent_id' => null,
        ]);

        foreach ($subtaskStatuses as $status) {
            Task::factory()->create([
                'project_id' => $project->id,
                'parent_id' => $parent->id,
                'status' => $status,
            ]);
        }

        return $parent->fresh();
    }

    /** Move one subtask on, which is what fires the observer. */
    private function complete(Task $subtask): void
    {
        $subtask->update(['status' => 'done']);
    }

    public function test_finishing_the_last_subtask_completes_the_parent(): void
    {
        $parent = $this->parentWithSubtasks(['done', 'in_progress']);
        $last = $parent->subtasks()->where('status', 'in_progress')->firstOrFail();

        $this->complete($last);

        $this->assertSame('done', $parent->fresh()->status);
    }

    public function test_the_parent_stays_open_while_any_subtask_is_outstanding(): void
    {
        $parent = $this->parentWithSubtasks(['to_do', 'to_do']);
        $first = $parent->subtasks()->firstOrFail();

        $this->complete($first);

        $this->assertSame('in_progress', $parent->fresh()->status);
    }

    public function test_a_cancelled_subtask_does_not_hold_the_parent_open(): void
    {
        // Cancelled work is not outstanding, so it must not block completion.
        $parent = $this->parentWithSubtasks(['cancelled', 'in_progress']);
        $last = $parent->subtasks()->where('status', 'in_progress')->firstOrFail();

        $this->complete($last);

        $this->assertSame('done', $parent->fresh()->status);
    }

    public function test_a_parent_whose_subtasks_are_all_cancelled_is_left_alone(): void
    {
        // Nothing was actually finished, so completing the parent would be a lie.
        $parent = $this->parentWithSubtasks(['cancelled']);
        $only = $parent->subtasks()->firstOrFail();

        $only->update(['status' => 'cancelled']);

        $this->assertSame('in_progress', $parent->fresh()->status);
    }

    public function test_completion_cascades_to_a_grandparent(): void
    {
        $project = Project::factory()->create();
        $grandparent = Task::factory()->create(['project_id' => $project->id, 'status' => 'in_progress']);
        $parent = Task::factory()->create([
            'project_id' => $project->id, 'parent_id' => $grandparent->id, 'status' => 'in_progress',
        ]);
        $child = Task::factory()->create([
            'project_id' => $project->id, 'parent_id' => $parent->id, 'status' => 'to_do',
        ]);

        $this->complete($child);

        $this->assertSame('done', $parent->fresh()->status, 'parent should close');
        $this->assertSame('done', $grandparent->fresh()->status, 'and carry the grandparent with it');
    }

    public function test_a_task_without_subtasks_is_untouched(): void
    {
        $project = Project::factory()->create();
        $task = Task::factory()->create(['project_id' => $project->id, 'status' => 'in_review']);

        $task->update(['priority' => 'high']);

        $this->assertSame('in_review', $task->fresh()->status);
    }

    public function test_completing_the_parent_stamps_completed_at(): void
    {
        $parent = $this->parentWithSubtasks(['to_do']);
        $only = $parent->subtasks()->firstOrFail();

        $this->complete($only);

        $this->assertNotNull($parent->fresh()->completed_at);
    }
}
