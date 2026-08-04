<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Division;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Workload and Reports show every person's numbers across the whole
 * organisation, so both are admin-only. Neither route checked anything before
 * this, so these are the tests that would have caught it.
 */
class WorkloadAndReportsAccessTest extends TestCase
{
    use RefreshDatabase;

    private function permissions(): void
    {
        foreach (['manage-users', 'view-workload', 'view-reports'] as $name) {
            Permission::findOrCreate($name);
        }
    }

    private function admin(): User
    {
        $this->permissions();
        Role::findOrCreate('admin')->syncPermissions(['manage-users', 'view-workload', 'view-reports']);

        $user = User::factory()->create(['is_active' => true]);
        $user->assignRole('admin');

        return $user;
    }

    private function withRole(string $role): User
    {
        $this->permissions();
        Role::findOrCreate($role);

        $user = User::factory()->create(['is_active' => true]);
        $user->assignRole($role);

        return $user;
    }

    public static function pages(): array
    {
        return [
            'workload' => ['/workload'],
            'reports' => ['/reports'],
        ];
    }

    public function test_an_admin_gets_into_workload(): void
    {
        $this->actingAs($this->admin())->get('/workload')->assertOk();
    }

    /**
     * Reports is checked for the gate only, not for a rendered page.
     *
     * ReportService reaches for MySQL's TIMESTAMPDIFF, which sqlite has no
     * answer for, so the page cannot render under the test database at all —
     * a pre-existing limit of that service, not of this permission. What
     * matters here is that an admin is let past the gate rather than refused.
     */
    public function test_an_admin_is_let_past_the_gate_on_reports(): void
    {
        $response = $this->actingAs($this->admin())->get('/reports');

        $this->assertNotSame(403, $response->getStatusCode());
    }

    #[DataProvider('pages')]
    public function test_an_ordinary_user_is_refused(string $url): void
    {
        $this->actingAs($this->withRole('user'))->get($url)->assertForbidden();
    }

    #[DataProvider('pages')]
    public function test_an_executive_is_refused(string $url): void
    {
        $this->actingAs($this->withRole('executive'))->get($url)->assertForbidden();
    }

    #[DataProvider('pages')]
    public function test_a_supervisor_is_refused(string $url): void
    {
        $this->actingAs($this->withRole('supervisor'))->get($url)->assertForbidden();
    }

    #[DataProvider('pages')]
    public function test_heading_a_unit_is_not_enough(string $url): void
    {
        $this->permissions();
        $head = User::factory()->create(['is_active' => true]);

        $division = Division::create(['name' => 'Field', 'head_id' => $head->id]);
        $department = Department::create(['name' => 'Support', 'division_id' => $division->id, 'head_id' => $head->id]);
        Team::create(['name' => 'Frontline', 'department_id' => $department->id, 'leader_id' => $head->id]);

        $this->actingAs($head)->get($url)->assertForbidden();
    }

    /**
     * Granting the permission is what opens the door, not the role name — the
     * point of gating on a permission rather than hard-coding hasRole('admin').
     */
    public function test_the_permission_can_be_granted_to_somebody_else(): void
    {
        $this->permissions();
        $user = User::factory()->create(['is_active' => true]);

        $this->actingAs($user)->get('/workload')->assertForbidden();

        $user->givePermissionTo('view-workload');

        $this->actingAs($user)->get('/workload')->assertOk();
        // Still refused for the other page — the two are granted separately.
        $this->actingAs($user)->get('/reports')->assertForbidden();
        $this->assertFalse($user->fresh()->can('view-reports'));
    }
}
