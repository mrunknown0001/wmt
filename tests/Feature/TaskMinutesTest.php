<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\TaskMinute;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

/**
 * A meeting task keeps minutes, filled in by hand by the people who were there.
 */
class TaskMinutesTest extends TestCase
{
    use RefreshDatabase;

    private function editor(): User
    {
        Permission::findOrCreate('manage-tasks');
        Permission::findOrCreate('manage-projects');
        $user = User::factory()->create(['is_active' => true]);
        $user->givePermissionTo('manage-tasks');

        return $user;
    }

    private function meeting(): Task
    {
        return Task::factory()->create([
            'project_id' => Project::factory()->create()->id,
            'task_type' => Task::TYPE_MEETING,
        ]);
    }

    public function test_a_task_is_a_standard_task_unless_told_otherwise(): void
    {
        $task = Task::factory()->create(['project_id' => Project::factory()->create()->id]);

        $this->assertSame(Task::TYPE_STANDARD, $task->fresh()->task_type);
        $this->assertFalse($task->isMeeting());
    }

    public function test_minutes_can_be_written_against_a_meeting_task(): void
    {
        $user = $this->editor();
        $task = $this->meeting();
        $chair = User::factory()->create(['is_active' => true]);

        $this->actingAs($user)
            ->putJson("/tasks/{$task->id}/minutes", [
                'meeting_title' => 'Quarterly hatchery review',
                'meeting_date' => '2026-09-03',
                'start_time' => '9:00 AM',
                'end_time' => '10:30 AM',
                'venue' => 'Conference Room B',
                'facilitator_user_id' => $chair->id,
                'meeting_type' => 'regular',
                'agenda' => ['Stock levels', 'Feed contract'],
                'attendees' => [
                    ['user_id' => $chair->id, 'name' => $chair->name, 'position' => 'Ops Head', 'attendance' => 'present'],
                ],
                'action_items' => [
                    ['action' => 'Circulate feed quotes', 'user_id' => $chair->id, 'name' => $chair->name,
                     'target_date' => '2026-09-10', 'status' => 'open'],
                ],
            ])
            ->assertOk();

        $minutes = $task->fresh()->minutes;
        $this->assertSame('Quarterly hatchery review', $minutes->meeting_title);
        $this->assertSame('2026-09-03', $minutes->meeting_date->toDateString());
        $this->assertSame(['Stock levels', 'Feed contract'], $minutes->agenda);
        $this->assertSame($chair->id, $minutes->attendees[0]['user_id']);
        $this->assertSame('2026-09-10', $minutes->action_items[0]['target_date']);
        $this->assertSame($user->id, $minutes->updated_by);
    }

    public function test_saving_again_updates_the_same_record_rather_than_adding_one(): void
    {
        $user = $this->editor();
        $task = $this->meeting();

        $this->actingAs($user)->putJson("/tasks/{$task->id}/minutes", ['venue' => 'Room A'])->assertOk();
        $this->actingAs($user)->putJson("/tasks/{$task->id}/minutes", ['venue' => 'Room B'])->assertOk();

        $this->assertSame(1, TaskMinute::where('task_id', $task->id)->count());
        $this->assertSame('Room B', $task->fresh()->minutes->venue);
    }

    public function test_a_standard_task_keeps_no_minutes(): void
    {
        $user = $this->editor();
        $task = Task::factory()->create(['project_id' => Project::factory()->create()->id]);

        $this->actingAs($user)
            ->putJson("/tasks/{$task->id}/minutes", ['venue' => 'Room A'])
            ->assertStatus(422);

        $this->assertNull($task->fresh()->minutes);
    }

    public function test_half_finished_minutes_can_be_saved(): void
    {
        $user = $this->editor();
        $task = $this->meeting();

        // Minutes are written as the meeting runs; nothing may be required.
        $this->actingAs($user)->putJson("/tasks/{$task->id}/minutes", [])->assertOk();

        $this->assertTrue($task->fresh()->minutes->isBlank());
    }

    public function test_a_person_must_be_someone_in_the_system(): void
    {
        $user = $this->editor();
        $task = $this->meeting();

        $this->actingAs($user)
            ->putJson("/tasks/{$task->id}/minutes", ['facilitator_user_id' => 999999])
            ->assertStatus(422)
            ->assertJsonValidationErrors('facilitator_user_id');
    }

    public function test_a_person_named_on_a_row_must_also_exist(): void
    {
        $user = $this->editor();
        $task = $this->meeting();

        $this->actingAs($user)
            ->putJson("/tasks/{$task->id}/minutes", [
                'action_items' => [['action' => 'Do the thing', 'user_id' => 999999]],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('action_items.0.user_id');
    }

    public function test_an_unknown_meeting_type_is_refused(): void
    {
        $user = $this->editor();
        $task = $this->meeting();

        $this->actingAs($user)
            ->putJson("/tasks/{$task->id}/minutes", ['meeting_type' => 'annual_general'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('meeting_type');
    }

    public function test_someone_who_cannot_edit_the_task_cannot_write_its_minutes(): void
    {
        Permission::findOrCreate('manage-tasks');   // the policy consults both
        Permission::findOrCreate('manage-projects');
        $task = $this->meeting();
        $outsider = User::factory()->create(['is_active' => true]);

        $this->actingAs($outsider)
            ->putJson("/tasks/{$task->id}/minutes", ['venue' => 'Room A'])
            ->assertStatus(403);

        $this->assertNull($task->fresh()->minutes);
    }

    public function test_a_guest_cannot_write_minutes(): void
    {
        $task = $this->meeting();

        $this->putJson("/tasks/{$task->id}/minutes", ['venue' => 'Room A'])
            ->assertStatus(401);
    }

    public function test_minutes_go_when_the_task_goes(): void
    {
        $user = $this->editor();
        $task = $this->meeting();
        $this->actingAs($user)->putJson("/tasks/{$task->id}/minutes", ['venue' => 'Room A'])->assertOk();

        $id = $task->minutes()->value('id');
        $task->forceDelete();

        $this->assertDatabaseMissing('task_minutes', ['id' => $id]);
    }

    public function test_written_minutes_do_not_read_as_blank(): void
    {
        $user = $this->editor();
        $task = $this->meeting();

        $this->actingAs($user)
            ->putJson("/tasks/{$task->id}/minutes", ['agenda' => ['Stock levels']])
            ->assertOk();

        $this->assertFalse($task->fresh()->minutes->isBlank());
    }
}
