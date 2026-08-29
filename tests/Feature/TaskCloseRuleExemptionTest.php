<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

/**
 * A project can require an attachment before a task closes. A single task can
 * be excused from that rule — but only by whoever runs the project, and only
 * on the record.
 */
class TaskCloseRuleExemptionTest extends TestCase
{
    use RefreshDatabase;

    private function ruleProject(array $attrs = []): Project
    {
        return Project::factory()->create($attrs + ['require_comment_attachment_on_close' => true]);
    }

    public function test_the_rule_still_blocks_a_task_that_is_not_exempt(): void
    {
        $task = Task::factory()->create([
            'project_id' => $this->ruleProject()->id,
            'status' => 'to_do',
        ]);

        $this->expectException(ValidationException::class);
        $task->update(['status' => 'done']);
    }

    public function test_an_exempt_task_closes_without_an_attachment(): void
    {
        $task = Task::factory()->create([
            'project_id' => $this->ruleProject()->id,
            'status' => 'to_do',
            'close_rule_exempt' => true,
            'close_rule_exempt_reason' => 'Verbal sign-off from the client; nothing to file.',
        ]);

        $task->update(['status' => 'done']);

        $this->assertSame('done', $task->fresh()->status);
    }

    public function test_the_exemption_covers_cancelling_as_well_as_completing(): void
    {
        $task = Task::factory()->create([
            'project_id' => $this->ruleProject()->id,
            'status' => 'to_do',
            'close_rule_exempt' => true,
        ]);

        $task->update(['status' => 'cancelled']);

        $this->assertSame('cancelled', $task->fresh()->status);
    }

    public function test_the_exemption_is_confined_to_the_task_that_holds_it(): void
    {
        $project = $this->ruleProject();
        Task::factory()->create([
            'project_id' => $project->id,
            'status' => 'to_do',
            'close_rule_exempt' => true,
        ])->update(['status' => 'done']);

        $sibling = Task::factory()->create(['project_id' => $project->id, 'status' => 'to_do']);

        $this->expectException(ValidationException::class);
        $sibling->update(['status' => 'done']);
    }

    public function test_granting_records_who_and_when(): void
    {
        $granter = User::factory()->create(['is_active' => true]);
        $this->actingAs($granter);

        $task = Task::factory()->create(['project_id' => $this->ruleProject()->id, 'status' => 'to_do']);
        $task->update(['close_rule_exempt' => true, 'close_rule_exempt_reason' => 'No artefact exists.']);

        $fresh = $task->fresh();
        $this->assertSame($granter->id, $fresh->close_rule_exempt_by);
        $this->assertNotNull($fresh->close_rule_exempt_at);
    }

    public function test_withdrawing_clears_the_record_rather_than_leaving_it_stale(): void
    {
        $granter = User::factory()->create(['is_active' => true]);
        $this->actingAs($granter);

        $task = Task::factory()->create(['project_id' => $this->ruleProject()->id, 'status' => 'to_do']);
        $task->update(['close_rule_exempt' => true, 'close_rule_exempt_reason' => 'No artefact exists.']);
        $task->update(['close_rule_exempt' => false]);

        $fresh = $task->fresh();
        $this->assertFalse((bool) $fresh->close_rule_exempt);
        $this->assertNull($fresh->close_rule_exempt_by);
        $this->assertNull($fresh->close_rule_exempt_at);
        $this->assertNull($fresh->close_rule_exempt_reason);

        // And the rule bites again.
        $this->expectException(ValidationException::class);
        $task->update(['status' => 'done']);
    }

    public function test_an_assignee_cannot_exempt_their_own_task(): void
    {
        Permission::findOrCreate('manage-tasks');
        Permission::findOrCreate('manage-projects'); // ProjectPolicy::update consults it
        $assignee = User::factory()->create(['is_active' => true]);
        $assignee->givePermissionTo('manage-tasks');

        $project = $this->ruleProject();               // owned by someone else
        $task = Task::factory()->create([
            'project_id' => $project->id,
            'assigned_to' => $assignee->id,
            'status' => 'to_do',
        ]);

        $this->actingAs($assignee)
            ->patchJson("/projects/{$project->id}/tasks/{$task->id}/patch", [
                'close_rule_exempt' => true,
                'close_rule_exempt_reason' => 'I would rather not attach anything.',
            ])
            ->assertStatus(422);

        $this->assertFalse((bool) $task->fresh()->close_rule_exempt);
    }

    public function test_the_project_owner_can_exempt(): void
    {
        Permission::findOrCreate('manage-tasks');
        Permission::findOrCreate('manage-projects');
        $owner = User::factory()->create(['is_active' => true]);
        $owner->givePermissionTo('manage-tasks');

        $project = $this->ruleProject(['owner_id' => $owner->id]);
        $task = Task::factory()->create(['project_id' => $project->id, 'status' => 'to_do']);

        $this->actingAs($owner)
            ->patchJson("/projects/{$project->id}/tasks/{$task->id}/patch", [
                'close_rule_exempt' => true,
                'close_rule_exempt_reason' => 'Work was a phone call; no file produced.',
            ])
            ->assertOk();

        $this->assertTrue((bool) $task->fresh()->close_rule_exempt);
    }

    public function test_a_waiver_must_say_why(): void
    {
        Permission::findOrCreate('manage-tasks');
        Permission::findOrCreate('manage-projects');
        $owner = User::factory()->create(['is_active' => true]);
        $owner->givePermissionTo('manage-tasks');

        $project = $this->ruleProject(['owner_id' => $owner->id]);
        $task = Task::factory()->create(['project_id' => $project->id, 'status' => 'to_do']);

        $this->actingAs($owner)
            ->patchJson("/projects/{$project->id}/tasks/{$task->id}/patch", [
                'close_rule_exempt' => true,
                'close_rule_exempt_reason' => '   ',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('close_rule_exempt_reason');

        $this->assertFalse((bool) $task->fresh()->close_rule_exempt);
    }

    public function test_an_assignee_editing_an_already_exempt_task_is_not_refused(): void
    {
        Permission::findOrCreate('manage-tasks');
        Permission::findOrCreate('manage-projects');
        $assignee = User::factory()->create(['is_active' => true]);
        $assignee->givePermissionTo('manage-tasks');

        $project = $this->ruleProject();
        $task = Task::factory()->create([
            'project_id' => $project->id,
            'assigned_to' => $assignee->id,
            'status' => 'to_do',
            'close_rule_exempt' => true,
        ]);

        // Resubmitting the unchanged flag must not read as an attempt to grant one.
        $this->actingAs($assignee)
            ->patchJson("/projects/{$project->id}/tasks/{$task->id}/patch", [
                'close_rule_exempt' => true,
                'priority' => 'high',
            ])
            ->assertOk();

        $this->assertSame('high', $task->fresh()->priority);
    }

    public function test_the_exemption_does_not_excuse_unfinished_dependencies(): void
    {
        $project = $this->ruleProject();
        $blocker = Task::factory()->create(['project_id' => $project->id, 'status' => 'to_do']);
        $task = Task::factory()->create([
            'project_id' => $project->id,
            'status' => 'to_do',
            'close_rule_exempt' => true,
        ]);
        $task->dependencies()->attach($blocker->id);

        // Waiving the attachment rule says nothing about work this task waits on.
        $this->expectException(ValidationException::class);
        $task->fresh()->update(['status' => 'done']);
    }
}
