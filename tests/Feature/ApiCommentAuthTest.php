<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

/** The API comment endpoints must ask the same questions the web ones do. */
class ApiCommentAuthTest extends TestCase
{
    use RefreshDatabase;

    private function person(): User
    {
        foreach (['manage-tasks', 'manage-projects', 'view-tasks', 'view-projects'] as $p) {
            Permission::findOrCreate($p);
        }
        return User::factory()->create(['is_active' => true]);
    }

    public function test_a_stranger_cannot_comment_on_a_project_task_through_the_api(): void
    {
        $owner = $this->person();
        $project = Project::factory()->create(['owner_id' => $owner->id]);
        $task = Task::factory()->create(['project_id' => $project->id]);

        Sanctum::actingAs($this->person());
        $this->postJson("/api/projects/{$project->id}/tasks/{$task->id}/comments", ['body' => 'nope'])
            ->assertStatus(403);

        $this->assertDatabaseMissing('task_comments', ['body' => 'nope']);
    }

    public function test_a_stranger_cannot_comment_on_a_standalone_task_through_the_api(): void
    {
        $owner = $this->person();
        $task = Task::factory()->create(['project_id' => null, 'created_by' => $owner->id]);

        Sanctum::actingAs($this->person());
        $this->postJson("/api/tasks/{$task->id}/comments", ['body' => 'nope2'])
            ->assertStatus(403);

        $this->assertDatabaseMissing('task_comments', ['body' => 'nope2']);
    }

    public function test_a_task_from_another_project_is_refused(): void
    {
        $owner = $this->person();
        $a = Project::factory()->create(['owner_id' => $owner->id]);
        $b = Project::factory()->create(['owner_id' => $owner->id]);
        $task = Task::factory()->create(['project_id' => $b->id]);

        Sanctum::actingAs($owner);   // owns both, so only the mismatch can refuse
        $this->postJson("/api/projects/{$a->id}/tasks/{$task->id}/comments", ['body' => 'mismatch'])
            ->assertStatus(404);
    }

    public function test_someone_entitled_can_still_comment(): void
    {
        $owner = $this->person();
        $project = Project::factory()->create(['owner_id' => $owner->id]);
        $task = Task::factory()->create(['project_id' => $project->id]);

        Sanctum::actingAs($owner);
        $this->postJson("/api/projects/{$project->id}/tasks/{$task->id}/comments", ['body' => 'allowed'])
            ->assertSuccessful();
    }
}
