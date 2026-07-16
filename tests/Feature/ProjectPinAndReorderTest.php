<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class ProjectPinAndReorderTest extends TestCase
{
    use RefreshDatabase;

    private function makeAdmin(): User
    {
        foreach (['manage-projects', 'view-projects'] as $perm) {
            Permission::findOrCreate($perm);
        }
        $role = Role::findOrCreate('admin');
        $role->givePermissionTo(['manage-projects', 'view-projects']);

        $user = User::factory()->create(['is_active' => true]);
        $user->assignRole($role);

        return $user;
    }

    public function test_toggle_pin_updates_is_pinned_flag(): void
    {
        $admin = $this->makeAdmin();
        $project = Project::create([
            'name' => 'Test Project',
            'status' => 'active',
            'owner_id' => $admin->id,
            'is_pinned' => false,
        ]);

        $response = $this->actingAs($admin)->patchJson("/projects/{$project->id}/toggle-pin");

        $response->assertOk()->assertJsonPath('is_pinned', true);
        $this->assertTrue($project->fresh()->is_pinned);

        // Toggle back
        $response = $this->actingAs($admin)->patchJson("/projects/{$project->id}/toggle-pin");
        $response->assertOk()->assertJsonPath('is_pinned', false);
        $this->assertFalse($project->fresh()->is_pinned);
    }

    public function test_reorder_updates_positions(): void
    {
        $admin = $this->makeAdmin();

        $projects = collect([
            Project::create(['name' => 'P1', 'status' => 'active', 'owner_id' => $admin->id, 'is_pinned' => false, 'position' => 0]),
            Project::create(['name' => 'P2', 'status' => 'active', 'owner_id' => $admin->id, 'is_pinned' => false, 'position' => 1]),
            Project::create(['name' => 'P3', 'status' => 'active', 'owner_id' => $admin->id, 'is_pinned' => false, 'position' => 2]),
        ]);

        $response = $this->actingAs($admin)->postJson('/projects/reorder', [
            'projects' => [
                ['id' => $projects[2]->id, 'position' => 0],
                ['id' => $projects[1]->id, 'position' => 1],
                ['id' => $projects[0]->id, 'position' => 2],
            ],
        ]);

        $response->assertOk();
        $this->assertSame(0, $projects[2]->fresh()->position);
        $this->assertSame(1, $projects[1]->fresh()->position);
        $this->assertSame(2, $projects[0]->fresh()->position);
    }

    public function test_projects_sorted_by_pinned_then_position(): void
    {
        $admin = $this->makeAdmin();

        $pinned1 = Project::create(['name' => 'Pinned 1', 'status' => 'active', 'owner_id' => $admin->id, 'is_pinned' => true, 'position' => 0]);
        $pinned2 = Project::create(['name' => 'Pinned 2', 'status' => 'active', 'owner_id' => $admin->id, 'is_pinned' => true, 'position' => 1]);
        $unpinned1 = Project::create(['name' => 'Unpinned 1', 'status' => 'active', 'owner_id' => $admin->id, 'is_pinned' => false, 'position' => 0]);
        $unpinned2 = Project::create(['name' => 'Unpinned 2', 'status' => 'active', 'owner_id' => $admin->id, 'is_pinned' => false, 'position' => 1]);

        $sorted = Project::where('status', '!=', 'archived')
            ->orderByDesc('is_pinned')
            ->orderBy('position')
            ->get();

        // Verify pinned projects come first
        $this->assertSame($pinned1->id, $sorted[0]->id);
        $this->assertSame($pinned2->id, $sorted[1]->id);
        $this->assertSame($unpinned1->id, $sorted[2]->id);
        $this->assertSame($unpinned2->id, $sorted[3]->id);
    }
}
