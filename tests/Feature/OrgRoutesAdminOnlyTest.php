<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Divisions, Departments and Teams are administration pages: the backend routes
 * are gated to the admin role, matching the sidebar which shows those links to
 * admins alone. Holding the view-* permissions is no longer enough.
 */
class OrgRoutesAdminOnlyTest extends TestCase
{
    use RefreshDatabase;

    private const PERMS = ['view-divisions', 'view-departments', 'view-teams', 'view-users'];

    protected function setUp(): void
    {
        parent::setUp();

        foreach (self::PERMS as $perm) {
            Permission::findOrCreate($perm);
        }
    }

    private function admin(): User
    {
        $role = Role::findOrCreate('admin');
        $role->givePermissionTo(self::PERMS);

        $user = User::factory()->create(['is_active' => true]);
        $user->assignRole($role);

        return $user;
    }

    /** A non-admin who nonetheless holds the org view permissions. */
    private function permittedNonAdmin(): User
    {
        $user = User::factory()->create(['is_active' => true]);
        $user->givePermissionTo(['view-divisions', 'view-departments', 'view-teams']);

        return $user;
    }

    public function test_a_non_admin_cannot_open_the_org_pages_even_with_view_permissions(): void
    {
        $user = $this->permittedNonAdmin();

        foreach (['/divisions', '/departments', '/teams'] as $path) {
            $this->actingAs($user)->get($path)->assertForbidden();
        }
    }

    public function test_a_non_admin_cannot_create_or_delete_org_records(): void
    {
        $user = $this->permittedNonAdmin();

        $this->actingAs($user)->get('/divisions/create')->assertForbidden();
        $this->actingAs($user)->post('/divisions', ['name' => 'Sneaky'])->assertForbidden();
        $this->assertDatabaseMissing('divisions', ['name' => 'Sneaky']);
    }

    public function test_an_admin_can_open_the_org_pages(): void
    {
        $admin = $this->admin();

        foreach (['/divisions', '/departments', '/teams'] as $path) {
            $this->actingAs($admin)->get($path)->assertOk();
        }
    }

    // ---- User Overview "back" target ----

    public function test_the_overview_points_back_to_my_personnel_without_users_access(): void
    {
        $user = User::factory()->create(['is_active' => true]);

        $this->actingAs($user)
            ->get("/users/{$user->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('canViewUsers', false));
    }

    public function test_the_overview_points_back_to_users_with_access(): void
    {
        $user = User::factory()->create(['is_active' => true]);
        $user->givePermissionTo('view-users');

        $this->actingAs($user)
            ->get("/users/{$user->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('canViewUsers', true));
    }
}
