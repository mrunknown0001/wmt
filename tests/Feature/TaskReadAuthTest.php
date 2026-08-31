<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\TaskComment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

/** Reading a task, or its timeline, must not be open to anyone who guesses an id. */
class TaskReadAuthTest extends TestCase
{
    use RefreshDatabase;

    private function person(): User
    {
        foreach (['manage-tasks', 'manage-projects', 'view-tasks', 'view-projects'] as $p) {
            Permission::findOrCreate($p);
        }
        return User::factory()->create(['is_active' => true]);
    }

    public function test_api_show_refuses_a_stranger_a_project_task(): void
    {
        $owner = $this->person();
        $project = Project::factory()->create(['owner_id' => $owner->id]);
        $task = Task::factory()->create(['project_id' => $project->id, 'title' => 'Confidential']);

        Sanctum::actingAs($this->person());
        $r = $this->getJson("/api/projects/{$project->id}/tasks/{$task->id}");
        $this->assertContains($r->status(), [403, 404], 'stranger got HTTP '.$r->status());
        $r->assertDontSee('Confidential');
    }

    public function test_api_show_refuses_a_stranger_a_standalone_task(): void
    {
        $owner = $this->person();
        $task = Task::factory()->create([
            'project_id' => null, 'created_by' => $owner->id, 'title' => 'Private note',
        ]);

        Sanctum::actingAs($this->person());
        $r = $this->getJson("/api/tasks/{$task->id}");
        $this->assertContains($r->status(), [403, 404], 'stranger got HTTP '.$r->status());
        $r->assertDontSee('Private note');
    }

    public function test_timeline_refuses_a_stranger(): void
    {
        $owner = $this->person();
        $project = Project::factory()->create(['owner_id' => $owner->id]);
        $task = Task::factory()->create(['project_id' => $project->id]);
        TaskComment::create([
            'task_id' => $task->id, 'user_id' => $owner->id, 'body' => 'Internal discussion',
        ]);

        $r = $this->actingAs($this->person())
            ->getJson("/projects/{$project->id}/tasks/{$task->id}/timeline");
        $this->assertContains($r->status(), [403, 404], 'stranger got HTTP '.$r->status());
        $r->assertDontSee('Internal discussion');
    }

    public function test_the_owner_can_still_read_the_timeline(): void
    {
        $owner = $this->person();
        $project = Project::factory()->create(['owner_id' => $owner->id]);
        $task = Task::factory()->create(['project_id' => $project->id]);

        $this->actingAs($owner)
            ->getJson("/projects/{$project->id}/tasks/{$task->id}/timeline")
            ->assertSuccessful();
    }
}
