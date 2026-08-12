<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Division;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The admin-only "Roles & Capabilities" page: a read-only account of a person's
 * roles, every capability those roles grant (and the ones they lack), and the
 * abilities derived from the org chart.
 */
class UserCapabilitiesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['manage-users', 'view-users', 'manage-tasks', 'view-tasks', 'view-projects'] as $perm) {
            Permission::findOrCreate($perm);
        }

        $admin = Role::findOrCreate('admin');
        $admin->givePermissionTo(['manage-users', 'view-users', 'manage-tasks', 'view-tasks', 'view-projects']);

        $supervisor = Role::findOrCreate('supervisor');
        $supervisor->givePermissionTo(['view-tasks', 'manage-tasks']);
    }

    private function admin(): User
    {
        $user = User::factory()->create(['is_active' => true]);
        $user->assignRole('admin');

        return $user;
    }

    public function test_an_admin_sees_a_users_roles_and_capabilities(): void
    {
        $target = User::factory()->create(['name' => 'Sam Supervisor', 'is_active' => true]);
        $target->assignRole('supervisor');

        $this->actingAs($this->admin())
            ->get("/users/{$target->id}/capabilities")
            ->assertOk()
            // Second arg false: this app leaves inertia.testing.page_paths unset,
            // so the page-file-exists check finds nothing — assert the name only.
            ->assertInertia(fn ($page) => $page
                ->component('Users/Capabilities', false)
                ->where('profile.name', 'Sam Supervisor')
                ->where('roles.0.name', 'supervisor')
                ->where('permissionCount', 2)
                ->has('permissionGroups')
                ->has('derived', 5));
    }

    public function test_the_matrix_marks_what_the_user_can_and_cannot_do(): void
    {
        $target = User::factory()->create(['is_active' => true]);
        $target->assignRole('supervisor');

        $this->actingAs($this->admin())
            ->get("/users/{$target->id}/capabilities")
            ->assertOk()
            ->assertInertia(function ($page) {
                $groups = collect($page->toArray()['props']['permissionGroups']);

                $manageTasks = collect($groups->firstWhere('resource', 'tasks')['permissions'])
                    ->firstWhere('name', 'manage-tasks');
                $this->assertTrue($manageTasks['has']);
                $this->assertSame(['supervisor'], $manageTasks['via']);

                // A capability the supervisor role does not carry.
                $manageUsers = collect($groups->firstWhere('resource', 'users')['permissions'])
                    ->firstWhere('name', 'manage-users');
                $this->assertFalse($manageUsers['has']);
            });
    }

    public function test_org_headship_is_reported(): void
    {
        $target = User::factory()->create(['is_active' => true]);
        $division = Division::create(['name' => 'Field', 'head_id' => $target->id]);
        Department::create(['name' => 'Support', 'division_id' => $division->id]);
        Team::create(['name' => 'Frontline', 'department_id' => Department::first()->id, 'leader_id' => $target->id]);

        $this->actingAs($this->admin())
            ->get("/users/{$target->id}/capabilities")
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('orgAuthority.divisions.0', 'Field')
                ->where('orgAuthority.teams.0', 'Frontline'));
    }

    public function test_a_non_admin_cannot_open_the_page(): void
    {
        $executive = User::factory()->create(['is_active' => true]);
        $executive->givePermissionTo('view-users'); // can see the users list, but not this

        $target = User::factory()->create(['is_active' => true]);

        $this->actingAs($executive)
            ->get("/users/{$target->id}/capabilities")
            ->assertForbidden();
    }
}
