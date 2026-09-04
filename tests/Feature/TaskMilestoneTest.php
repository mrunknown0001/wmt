<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

/**
 * Milestones are zero-duration markers, and only whoever runs the project may
 * declare one.
 */
class TaskMilestoneTest extends TestCase
{
    use RefreshDatabase;

    public function test_marking_a_task_a_milestone_leaves_its_span_alone(): void
    {
        $task = Task::factory()->create([
            'project_id' => Project::factory()->create()->id,
            'start_date' => '2026-05-12',
            'due_date' => '2026-05-23',
        ]);

        $task->update(['is_milestone' => true]);

        $fresh = $task->fresh();
        $this->assertSame('2026-05-12', $fresh->start_date->toDateString(),
            'Flagging a milestone must not throw away when the work started.');
        $this->assertSame('2026-05-23', $fresh->due_date->toDateString());
        $this->assertTrue((bool) $fresh->is_milestone);
    }

    public function test_a_milestone_with_one_date_still_has_just_the_one(): void
    {
        $task = Task::factory()->create([
            'project_id' => Project::factory()->create()->id,
            'start_date' => null,
            'due_date' => '2026-05-23',
            'is_milestone' => true,
        ]);

        $fresh = $task->fresh();
        $this->assertNull($fresh->start_date, 'Nothing invents a start date that was never given.');
        $this->assertSame('2026-05-23', $fresh->due_date->toDateString());
    }

    public function test_an_ordinary_task_keeps_its_span(): void
    {
        $task = Task::factory()->create([
            'project_id' => Project::factory()->create()->id,
            'start_date' => '2026-05-12',
            'due_date' => '2026-05-23',
        ]);

        $task->update(['priority' => 'high']);

        $this->assertSame('2026-05-12', $task->fresh()->start_date->toDateString());
    }

    public function test_an_assignee_cannot_promote_their_own_task_to_a_milestone(): void
    {
        Permission::findOrCreate('manage-tasks');
        Permission::findOrCreate('manage-projects'); // ProjectPolicy::update consults it
        $assignee = User::factory()->create(['is_active' => true]);
        $assignee->givePermissionTo('manage-tasks');

        $project = Project::factory()->create();   // owned by someone else
        $task = Task::factory()->create([
            'project_id' => $project->id,
            'assigned_to' => $assignee->id,
            'status' => 'to_do',
        ]);

        $this->actingAs($assignee)
            ->patchJson("/projects/{$project->id}/tasks/{$task->id}/patch", ['is_milestone' => true])
            ->assertStatus(422);

        $this->assertFalse((bool) $task->fresh()->is_milestone);
    }

    public function test_the_project_owner_can(): void
    {
        Permission::findOrCreate('manage-tasks');
        Permission::findOrCreate('manage-projects'); // ProjectPolicy::update consults it
        $owner = User::factory()->create(['is_active' => true]);
        $owner->givePermissionTo('manage-tasks');

        $project = Project::factory()->create(['owner_id' => $owner->id]);
        $task = Task::factory()->create(['project_id' => $project->id, 'status' => 'to_do']);

        $this->actingAs($owner)
            ->patchJson("/projects/{$project->id}/tasks/{$task->id}/patch", ['is_milestone' => true])
            ->assertOk();

        $this->assertTrue((bool) $task->fresh()->is_milestone);
    }
}
