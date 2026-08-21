<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\TaskSection;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

/**
 * A task may only be filed into a section of its own project.
 *
 * The three task requests validated section_id with exists:task_sections,id,
 * which proves a section exists somewhere rather than here — so a task could be
 * filed into another project's section, breaking the assumption all the grouping
 * code makes.
 */
class TaskSectionScopingTest extends TestCase
{
    use RefreshDatabase;

    private function manager(): User
    {
        Permission::findOrCreate('manage-tasks');
        $user = User::factory()->create(['is_active' => true]);
        $user->givePermissionTo('manage-tasks');

        return $user;
    }

    private function section(Project $project, string $name = 'Section'): TaskSection
    {
        return TaskSection::create(['project_id' => $project->id, 'name' => $name, 'position' => 0]);
    }

    // ------------------------------------------------------------- patch

    public function test_patch_refuses_a_section_from_another_project(): void
    {
        $user = $this->manager();
        $mine = Project::factory()->create();
        $theirs = Project::factory()->create();
        $task = Task::factory()->create(['project_id' => $mine->id, 'status' => 'to_do']);
        $foreign = $this->section($theirs, 'Not mine');

        $this->actingAs($user)
            ->patchJson("/projects/{$mine->id}/tasks/{$task->id}/patch", ['section_id' => $foreign->id])
            ->assertStatus(422);

        $this->assertNull($task->fresh()->section_id);
    }

    public function test_patch_accepts_a_section_from_the_same_project(): void
    {
        $user = $this->manager();
        $project = Project::factory()->create();
        $task = Task::factory()->create(['project_id' => $project->id, 'status' => 'to_do']);
        $own = $this->section($project, 'Mine');

        $this->actingAs($user)
            ->patchJson("/projects/{$project->id}/tasks/{$task->id}/patch", ['section_id' => $own->id])
            ->assertOk();

        $this->assertSame($own->id, $task->fresh()->section_id);
    }

    public function test_patch_still_allows_ungrouping(): void
    {
        // Null must stay valid — clearing a task's section is legitimate.
        $user = $this->manager();
        $project = Project::factory()->create();
        $own = $this->section($project);
        $task = Task::factory()->create([
            'project_id' => $project->id, 'status' => 'to_do', 'section_id' => $own->id,
        ]);

        $this->actingAs($user)
            ->patchJson("/projects/{$project->id}/tasks/{$task->id}/patch", ['section_id' => null])
            ->assertOk();

        $this->assertNull($task->fresh()->section_id);
    }

    // ------------------------------------------------------------ create

    public function test_creating_a_task_refuses_a_section_from_another_project(): void
    {
        $user = $this->manager();
        $mine = Project::factory()->create();
        $foreign = $this->section(Project::factory()->create(), 'Not mine');

        $this->actingAs($user)
            ->post("/projects/{$mine->id}/tasks", [
                'title' => 'New task',
                'status' => 'to_do',
                'priority' => 'medium',
                'section_id' => $foreign->id,
            ])
            ->assertSessionHasErrors('section_id');

        $this->assertSame(0, Task::where('section_id', $foreign->id)->count());
    }

    // -------------------------------------------------------- standalone

    public function test_a_standalone_task_cannot_be_given_a_section_at_all(): void
    {
        // Wider than first reported: the standalone controller applies validated()
        // wholesale, and a task outside any project has no sections to belong to.
        $user = $this->manager();
        $foreign = $this->section(Project::factory()->create());
        $task = Task::factory()->create(['project_id' => null, 'status' => 'to_do']);

        $this->actingAs($user)
            ->patchJson("/tasks/{$task->id}/patch", ['section_id' => $foreign->id])
            ->assertStatus(422);

        $this->assertNull($task->fresh()->section_id);
    }
}
