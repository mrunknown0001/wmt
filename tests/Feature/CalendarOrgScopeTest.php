<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Division;
use App\Models\Project;
use App\Models\Task;
use App\Models\Team;
use App\Models\User;
use App\Services\OrgScope;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The calendar's org filters are a permission boundary, so the interesting
 * cases are the ones where someone reaches for a unit that is not theirs.
 */
class CalendarOrgScopeTest extends TestCase
{
    use RefreshDatabase;

    private array $org = [];

    /**
     * Two divisions, each with a department and a team, plus one member each.
     *
     * Sales                      Ops
     *   Sales Dept                 Ops Dept
     *     Sales Team                 Ops Team
     *       salesMember                opsMember
     */
    private function buildOrg(): void
    {
        $divisionHead = User::factory()->create(['name' => 'Division Head', 'is_active' => true]);
        $departmentHead = User::factory()->create(['name' => 'Department Head', 'is_active' => true]);
        $teamLeader = User::factory()->create(['name' => 'Team Leader', 'is_active' => true]);

        $sales = Division::create(['name' => 'Sales', 'head_id' => $divisionHead->id]);
        $ops = Division::create(['name' => 'Ops', 'head_id' => null]);

        $salesDept = Department::create(['name' => 'Sales Dept', 'division_id' => $sales->id, 'head_id' => $departmentHead->id]);
        $opsDept = Department::create(['name' => 'Ops Dept', 'division_id' => $ops->id, 'head_id' => null]);

        $salesTeam = Team::create(['name' => 'Sales Team', 'department_id' => $salesDept->id, 'leader_id' => $teamLeader->id]);
        $opsTeam = Team::create(['name' => 'Ops Team', 'department_id' => $opsDept->id, 'leader_id' => null]);

        $this->org = compact(
            'divisionHead', 'departmentHead', 'teamLeader',
            'sales', 'ops', 'salesDept', 'opsDept', 'salesTeam', 'opsTeam'
        );

        $this->org['salesMember'] = User::factory()->create([
            'name' => 'Sales Member', 'is_active' => true,
            'department_id' => $salesDept->id, 'team_id' => $salesTeam->id,
        ]);

        $this->org['opsMember'] = User::factory()->create([
            'name' => 'Ops Member', 'is_active' => true,
            'department_id' => $opsDept->id, 'team_id' => $opsTeam->id,
        ]);
    }

    private function makeAdmin(): User
    {
        Permission::findOrCreate('manage-users');
        Role::findOrCreate('admin')->givePermissionTo('manage-users');

        $user = User::factory()->create(['is_active' => true]);
        $user->assignRole('admin');

        return $user;
    }

    private function makeExecutive(): User
    {
        Role::findOrCreate('executive');

        $user = User::factory()->create(['is_active' => true]);
        $user->assignRole('executive');

        return $user;
    }

    private static function ids($collection): array
    {
        return $collection->pluck('id')->sort()->values()->all();
    }

    // ---- what each role may choose from ----

    public function test_admin_may_choose_any_unit(): void
    {
        $this->buildOrg();
        $units = OrgScope::visibleUnits($this->makeAdmin());

        $this->assertCount(2, $units['divisions']);
        $this->assertCount(2, $units['departments']);
        $this->assertCount(2, $units['teams']);
    }

    public function test_executive_may_choose_any_unit(): void
    {
        $this->buildOrg();
        $units = OrgScope::visibleUnits($this->makeExecutive());

        $this->assertCount(2, $units['divisions']);
        $this->assertCount(2, $units['departments']);
        $this->assertCount(2, $units['teams']);
    }

    public function test_division_head_gets_their_division_and_everything_under_it(): void
    {
        $this->buildOrg();
        $units = OrgScope::visibleUnits($this->org['divisionHead']);

        $this->assertSame([$this->org['sales']->id], self::ids($units['divisions']));
        $this->assertSame([$this->org['salesDept']->id], self::ids($units['departments']));
        $this->assertSame([$this->org['salesTeam']->id], self::ids($units['teams']));
    }

    public function test_department_head_gets_their_department_and_its_teams_but_no_division(): void
    {
        $this->buildOrg();
        $units = OrgScope::visibleUnits($this->org['departmentHead']);

        $this->assertSame([], self::ids($units['divisions']));
        $this->assertSame([$this->org['salesDept']->id], self::ids($units['departments']));
        $this->assertSame([$this->org['salesTeam']->id], self::ids($units['teams']));
    }

    public function test_team_leader_gets_only_their_team(): void
    {
        $this->buildOrg();
        $units = OrgScope::visibleUnits($this->org['teamLeader']);

        $this->assertSame([], self::ids($units['divisions']));
        $this->assertSame([], self::ids($units['departments']));
        $this->assertSame([$this->org['salesTeam']->id], self::ids($units['teams']));
    }

    public function test_an_ordinary_member_gets_nothing_to_choose_from(): void
    {
        $this->buildOrg();
        $units = OrgScope::visibleUnits($this->org['salesMember']);

        $this->assertSame([], self::ids($units['divisions']));
        $this->assertSame([], self::ids($units['departments']));
        $this->assertSame([], self::ids($units['teams']));
        $this->assertFalse(OrgScope::hasAnyScope($this->org['salesMember']));
    }

    public function test_roles_are_additive_across_branches(): void
    {
        $this->buildOrg();

        // The Sales division head also leads a team over in Ops.
        $this->org['opsTeam']->update(['leader_id' => $this->org['divisionHead']->id]);

        $units = OrgScope::visibleUnits($this->org['divisionHead']);

        $this->assertSame([$this->org['sales']->id], self::ids($units['divisions']));
        $this->assertSame(
            [$this->org['salesTeam']->id, $this->org['opsTeam']->id],
            self::ids($units['teams'])
        );
    }

    // ---- the permission check itself ----

    public function test_a_unit_outside_someones_scope_is_stripped(): void
    {
        $this->buildOrg();

        $permitted = OrgScope::permitted($this->org['departmentHead'], [
            'divisions' => [$this->org['sales']->id, $this->org['ops']->id],
            'departments' => [$this->org['salesDept']->id, $this->org['opsDept']->id],
            'teams' => [$this->org['salesTeam']->id, $this->org['opsTeam']->id],
        ]);

        // They head Sales Dept: no divisions at all, and nothing from Ops.
        $this->assertSame([], $permitted['divisions']);
        $this->assertSame([$this->org['salesDept']->id], $permitted['departments']);
        $this->assertSame([$this->org['salesTeam']->id], $permitted['teams']);
    }

    public function test_garbage_ids_are_discarded(): void
    {
        $this->buildOrg();

        $permitted = OrgScope::permitted($this->makeAdmin(), [
            'divisions' => ['not-a-number', 0, 99999],
            'departments' => [],
            'teams' => null,
        ]);

        $this->assertSame([], $permitted['divisions']);
        $this->assertSame([], $permitted['departments']);
        $this->assertSame([], $permitted['teams']);
    }

    // ---- resolving units to people ----

    public function test_choosing_a_division_reaches_people_filed_under_its_departments(): void
    {
        $this->buildOrg();

        $ids = OrgScope::usersIn(['divisions' => [$this->org['sales']->id]]);

        $this->assertContains($this->org['salesMember']->id, $ids);
        $this->assertNotContains($this->org['opsMember']->id, $ids);
    }

    public function test_choosing_a_team_reaches_its_members_only(): void
    {
        $this->buildOrg();

        $ids = OrgScope::usersIn(['teams' => [$this->org['salesTeam']->id]]);

        $this->assertContains($this->org['salesMember']->id, $ids);
        $this->assertNotContains($this->org['opsMember']->id, $ids);
    }

    public function test_a_department_reaches_people_attached_only_through_a_team(): void
    {
        $this->buildOrg();

        // Filed against the team but never given a department.
        $stray = User::factory()->create([
            'is_active' => true, 'department_id' => null, 'team_id' => $this->org['salesTeam']->id,
        ]);

        $ids = OrgScope::usersIn(['departments' => [$this->org['salesDept']->id]]);

        $this->assertContains($stray->id, $ids);
    }

    public function test_deactivated_people_are_left_out(): void
    {
        $this->buildOrg();
        $this->org['salesMember']->update(['is_active' => false]);

        $ids = OrgScope::usersIn(['teams' => [$this->org['salesTeam']->id]]);

        $this->assertNotContains($this->org['salesMember']->id, $ids);
    }

    public function test_an_empty_selection_resolves_to_nobody(): void
    {
        $this->buildOrg();

        $this->assertTrue(OrgScope::usersIn([])->isEmpty());
        $this->assertTrue(OrgScope::usersIn(['divisions' => [], 'departments' => [], 'teams' => []])->isEmpty());
    }

    // ---- and what the calendar actually returns ----

    private function taskFor(User $assignee, string $title): Task
    {
        $project = Project::firstOrCreate(
            ['name' => 'Calendar Project'],
            ['status' => 'active', 'owner_id' => $assignee->id]
        );

        return Task::create([
            'project_id' => $project->id,
            'title' => $title,
            'status' => 'to_do',
            'priority' => 'medium',
            'assigned_to' => $assignee->id,
            'due_date' => now()->startOfMonth()->addDays(9)->toDateString(),
        ]);
    }

    public function test_with_no_selection_the_calendar_stays_personal(): void
    {
        $this->buildOrg();
        $this->taskFor($this->org['salesMember'], 'Member task');
        $this->taskFor($this->org['divisionHead'], 'Head task');

        $this->actingAs($this->org['divisionHead'])
            ->get('/calendar')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('tasks.0.title', 'Head task')
                ->has('tasks', 1));
    }

    public function test_choosing_a_division_shows_that_divisions_tasks(): void
    {
        $this->buildOrg();
        $this->taskFor($this->org['salesMember'], 'Member task');
        $this->taskFor($this->org['opsMember'], 'Ops task');

        $this->actingAs($this->org['divisionHead'])
            ->get('/calendar?divisions[]=' . $this->org['sales']->id)
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('tasks.0.title', 'Member task')
                ->has('tasks', 1));
    }

    public function test_asking_for_someone_elses_unit_returns_nothing_of_theirs(): void
    {
        $this->buildOrg();
        $this->taskFor($this->org['opsMember'], 'Ops task');
        $this->taskFor($this->org['teamLeader'], 'Leader task');

        // The team leader tries the Ops division by hand-editing the URL.
        $this->actingAs($this->org['teamLeader'])
            ->get('/calendar?divisions[]=' . $this->org['ops']->id)
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                // Stripped to an empty selection, so it falls back to their own.
                ->where('orgFilters.divisions', [])
                ->where('tasks.0.title', 'Leader task')
                ->has('tasks', 1));
    }

    public function test_the_picker_only_offers_units_within_scope(): void
    {
        $this->buildOrg();

        $this->actingAs($this->org['teamLeader'])
            ->get('/calendar')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('orgUnits.divisions', 0)
                ->has('orgUnits.departments', 0)
                ->has('orgUnits.teams', 1)
                ->where('orgUnits.canSeeAll', false));
    }

    public function test_everyone_shows_the_whole_organisations_tasks(): void
    {
        $this->buildOrg();
        $this->taskFor($this->org['salesMember'], 'Sales task');
        $this->taskFor($this->org['opsMember'], 'Ops task');

        $this->actingAs($this->makeAdmin())
            ->get('/calendar?all=1')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('orgFilters.all', true)
                ->has('tasks', 2));
    }

    public function test_everyone_is_ignored_for_someone_who_does_not_run_the_place(): void
    {
        $this->buildOrg();
        $this->taskFor($this->org['opsMember'], 'Ops task');
        $this->taskFor($this->org['teamLeader'], 'Leader task');

        $this->actingAs($this->org['teamLeader'])
            ->get('/calendar?all=1')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('orgFilters.all', false)
                ->where('tasks.0.title', 'Leader task')
                ->has('tasks', 1));
    }

    public function test_an_admin_sees_the_whole_org_in_the_picker(): void
    {
        $this->buildOrg();

        $this->actingAs($this->makeAdmin())
            ->get('/calendar')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('orgUnits.divisions', 2)
                ->has('orgUnits.departments', 2)
                ->has('orgUnits.teams', 2)
                ->where('orgUnits.canSeeAll', true));
    }
}
