<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

/**
 * The standalone comment endpoint must not be a way around the project one.
 */
class StandaloneCommentAuthTest extends TestCase
{
    use RefreshDatabase;

    private function outsider(): User
    {
        foreach (['manage-tasks', 'manage-projects', 'view-tasks', 'view-projects'] as $p) {
            Permission::findOrCreate($p);
        }
        return User::factory()->create(['is_active' => true]);
    }

    public function test_a_stranger_cannot_comment_on_someone_elses_standalone_task(): void
    {
        $owner = $this->outsider();
        $task = Task::factory()->create(['project_id' => null, 'created_by' => $owner->id]);

        $this->actingAs($this->outsider())
            ->post("/tasks/{$task->id}/comments", ['body' => 'I should not be here'])
            ->assertStatus(403);

        $this->assertDatabaseMissing('task_comments', ['body' => 'I should not be here']);
    }

    public function test_the_standalone_route_is_not_a_back_door_onto_a_project_task(): void
    {
        $owner = $this->outsider();
        $project = Project::factory()->create(['owner_id' => $owner->id]);
        $task = Task::factory()->create(['project_id' => $project->id]);

        // The project route would refuse this person. The standalone route must
        // not accept the same task and skip that check.
        $this->actingAs($this->outsider())
            ->post("/tasks/{$task->id}/comments", ['body' => 'Back door'])
            ->assertStatus(404);

        $this->assertDatabaseMissing('task_comments', ['body' => 'Back door']);
    }

    public function test_the_owner_of_a_standalone_task_can_still_comment(): void
    {
        $owner = $this->outsider();
        $task = Task::factory()->create(['project_id' => null, 'created_by' => $owner->id]);

        $this->actingAs($owner)
            ->post("/tasks/{$task->id}/comments", ['body' => 'Mine to comment on'])
            ->assertStatus(302);

        $this->assertDatabaseHas('task_comments', ['body' => 'Mine to comment on']);
    }

    public function test_an_assignee_can_still_comment(): void
    {
        $owner = $this->outsider();
        $assignee = $this->outsider();
        $task = Task::factory()->create([
            'project_id' => null, 'created_by' => $owner->id, 'assigned_to' => $assignee->id,
        ]);

        $this->actingAs($assignee)
            ->post("/tasks/{$task->id}/comments", ['body' => 'Assigned to me'])
            ->assertStatus(302);
    }
}
