<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

/**
 * Reproduction: a project admin reports 403 when creating a task.
 */
class ProjectAdminCreatesTaskTest extends TestCase
{
    use RefreshDatabase;

    private function projectAdmin(): array
    {
        foreach (['manage-tasks', 'manage-projects', 'view-tasks', 'view-projects'] as $p) {
            Permission::findOrCreate($p);
        }
        $owner = User::factory()->create(['is_active' => true]);
        $admin = User::factory()->create(['is_active' => true]);
        // No global permissions — their standing comes only from membership.
        $project = Project::factory()->create(['owner_id' => $owner->id]);
        $project->members()->attach($admin->id, ['role' => 'admin']);

        return [$project, $admin];
    }

    public function test_member_role_reports_admin(): void
    {
        [$project, $admin] = $this->projectAdmin();

        $this->assertSame('admin', $project->memberRole($admin), 'membership role lookup');
        $this->assertTrue($project->isProjectAdmin($admin), 'isProjectAdmin');
        $this->assertTrue($project->userCanManageTasks($admin), 'userCanManageTasks');
    }

    public function test_member_role_still_works_when_members_are_eager_loaded(): void
    {
        [$project, $admin] = $this->projectAdmin();

        $loaded = Project::with('members')->find($project->id);
        $this->assertSame('admin', $loaded->memberRole($admin), 'eager-loaded path');
        $this->assertTrue($loaded->userCanManageTasks($admin), 'eager-loaded userCanManageTasks');
    }

    public function test_the_create_page_is_not_refused(): void
    {
        [$project, $admin] = $this->projectAdmin();

        $this->actingAs($admin)
            ->get("/projects/{$project->id}/tasks/create")
            ->assertStatus(200);
    }

    public function test_the_task_actually_stores(): void
    {
        [$project, $admin] = $this->projectAdmin();

        $this->actingAs($admin)
            ->post("/projects/{$project->id}/tasks", [
                'title' => 'Raised by a project admin',
                'status' => 'to_do',
                'priority' => 'medium',
            ])
            ->assertStatus(302);

        $this->assertDatabaseHas('tasks', ['title' => 'Raised by a project admin']);
    }

    public function test_quick_add_of_a_subtask_is_not_refused(): void
    {
        [$project, $admin] = $this->projectAdmin();
        $parent = \App\Models\Task::factory()->create(['project_id' => $project->id]);

        $this->actingAs($admin)
            ->postJson("/projects/{$project->id}/tasks/quick", [
                'title' => 'Quick one', 'parent_id' => $parent->id,
            ])
            ->assertStatus(201);
    }

    public function test_a_project_admin_can_also_edit_a_task_they_are_not_assigned(): void
    {
        [$project, $admin] = $this->projectAdmin();
        $task = \App\Models\Task::factory()->create([
            'project_id' => $project->id, 'status' => 'to_do',
        ]);

        $this->actingAs($admin)
            ->put("/projects/{$project->id}/tasks/{$task->id}", [
                'title' => 'Retitled by the project admin',
                'status' => 'to_do', 'priority' => 'high',
            ])
            ->assertStatus(302);

        $this->assertSame('Retitled by the project admin', $task->fresh()->title);
    }

    public function test_a_viewer_is_still_refused(): void
    {
        [$project, ] = $this->projectAdmin();
        $viewer = User::factory()->create(['is_active' => true]);
        $project->members()->attach($viewer->id, ['role' => 'viewer']);

        $this->actingAs($viewer)
            ->post("/projects/{$project->id}/tasks", [
                'title' => 'Should not be allowed',
                'status' => 'to_do', 'priority' => 'medium',
            ])
            ->assertStatus(403);
    }

    public function test_an_outsider_is_still_refused(): void
    {
        [$project, ] = $this->projectAdmin();
        $outsider = User::factory()->create(['is_active' => true]);

        $this->actingAs($outsider)
            ->post("/projects/{$project->id}/tasks", [
                'title' => 'Should not be allowed',
                'status' => 'to_do', 'priority' => 'medium',
            ])
            ->assertStatus(403);
    }
}
