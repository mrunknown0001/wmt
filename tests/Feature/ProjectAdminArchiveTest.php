<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * A project-level admin member runs the project like the owner — edits it,
 * manages its tasks and settings — with one deliberate exception: they cannot
 * archive or delete it. Retiring the project stays with the owner (and global
 * project managers).
 */
class ProjectAdminArchiveTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private User $projectAdmin;
    private User $globalManager;
    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['view-projects', 'manage-projects', 'manage-tasks'] as $perm) {
            Permission::findOrCreate($perm);
        }

        $this->owner = User::factory()->create(['is_active' => true]);
        $this->projectAdmin = User::factory()->create(['is_active' => true]);

        $this->globalManager = User::factory()->create(['is_active' => true]);
        $this->globalManager->givePermissionTo('manage-projects');

        $this->project = Project::create([
            'name' => 'Delivery',
            'status' => 'active',
            'owner_id' => $this->owner->id,
        ]);

        // The distinguishing fact under test: a member with the 'admin' role.
        $this->project->members()->attach($this->projectAdmin->id, ['role' => 'admin']);
    }

    /** A full, valid edit-form payload that keeps the admin a member. */
    private function editPayload(array $overrides = []): array
    {
        return array_merge([
            'name' => $this->project->name,
            'status' => $this->project->status,
            'members' => [
                ['user_id' => $this->projectAdmin->id, 'role' => 'admin'],
            ],
        ], $overrides);
    }

    // ---- what a project admin keeps ----

    public function test_a_project_admin_can_still_edit_and_manage_tasks(): void
    {
        $this->assertTrue($this->project->userCanManageProject($this->projectAdmin));
        $this->assertTrue($this->project->userCanManageTasks($this->projectAdmin));

        $this->actingAs($this->projectAdmin)
            ->from("/projects/{$this->project->id}/edit")
            ->put("/projects/{$this->project->id}", $this->editPayload(['name' => 'Delivery (renamed)']))
            ->assertRedirect();

        $this->assertSame('Delivery (renamed)', $this->project->fresh()->name);
    }

    public function test_a_project_admin_can_change_status_between_non_archived_states(): void
    {
        $this->actingAs($this->projectAdmin)
            ->from("/projects/{$this->project->id}/edit")
            ->put("/projects/{$this->project->id}", $this->editPayload(['status' => 'on_hold']))
            ->assertRedirect();

        $this->assertSame('on_hold', $this->project->fresh()->status);
    }

    // ---- what a project admin loses ----

    public function test_a_project_admin_cannot_archive_via_the_action(): void
    {
        $this->actingAs($this->projectAdmin)
            ->patch("/projects/{$this->project->id}/archive")
            ->assertForbidden();

        $this->assertSame('active', $this->project->fresh()->status);
    }

    public function test_a_project_admin_cannot_archive_via_the_edit_form(): void
    {
        $this->actingAs($this->projectAdmin)
            ->from("/projects/{$this->project->id}/edit")
            ->put("/projects/{$this->project->id}", $this->editPayload(['status' => 'archived']))
            ->assertSessionHasErrors('status');

        $this->assertSame('active', $this->project->fresh()->status);
    }

    public function test_a_project_admin_cannot_unarchive_via_the_edit_form(): void
    {
        $this->project->update(['status' => 'archived']);

        $this->actingAs($this->projectAdmin)
            ->from("/projects/{$this->project->id}/edit")
            ->put("/projects/{$this->project->id}", $this->editPayload(['status' => 'active']))
            ->assertSessionHasErrors('status');

        $this->assertSame('archived', $this->project->fresh()->status);
    }

    public function test_a_project_admin_cannot_delete(): void
    {
        $this->actingAs($this->projectAdmin)
            ->delete("/projects/{$this->project->id}")
            ->assertForbidden();

        $this->assertNotNull(Project::find($this->project->id));
    }

    // ---- what the owner (and a global manager) can still do ----

    public function test_the_owner_can_archive(): void
    {
        $this->actingAs($this->owner)
            ->patch("/projects/{$this->project->id}/archive")
            ->assertRedirect();

        $this->assertSame('archived', $this->project->fresh()->status);
    }

    public function test_the_owner_can_delete(): void
    {
        $this->actingAs($this->owner)
            ->delete("/projects/{$this->project->id}")
            ->assertRedirect();

        $this->assertNull(Project::find($this->project->id));
    }

    public function test_a_global_manager_can_archive_and_delete(): void
    {
        $this->actingAs($this->globalManager)
            ->patch("/projects/{$this->project->id}/archive")
            ->assertRedirect();
        $this->assertSame('archived', $this->project->fresh()->status);

        $this->actingAs($this->globalManager)
            ->delete("/projects/{$this->project->id}")
            ->assertRedirect();
        $this->assertNull(Project::find($this->project->id));
    }

    // ---- the flag the page reads ----

    public function test_the_show_page_hides_archive_from_a_project_admin_but_not_the_owner(): void
    {
        $this->actingAs($this->projectAdmin)
            ->get("/projects/{$this->project->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('canManageProject', true)
                ->where('canArchiveProject', false));

        $this->actingAs($this->owner)
            ->get("/projects/{$this->project->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('canArchiveProject', true));
    }
}
