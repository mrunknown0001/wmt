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
 * Workload, seen from inside the org chart.
 *
 * A division head gets their whole branch and a department head gets their
 * department — the same downward walk OrgScope gives My Personnel, rather than
 * the copy this page used to carry, which had no answer for a division head and
 * showed them nobody but themselves.
 */
class WorkloadOrgScopeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        Permission::findOrCreate('view-workload');
        Permission::findOrCreate('manage-users');
    }

    /**
     * One division, two departments, one team, and a person in every awkward
     * position the schema allows — including somebody filed against a team with
     * no department stamped on their row, who the old query dropped.
     */
    private function org(): array
    {
        $division = Division::create(['name' => 'Operations']);
        $other = Division::create(['name' => 'Corporate']);

        $support = Department::create(['name' => 'Support', 'division_id' => $division->id]);
        $logistics = Department::create(['name' => 'Logistics', 'division_id' => $division->id]);
        $finance = Department::create(['name' => 'Finance', 'division_id' => $other->id]);

        $frontline = Team::create(['name' => 'Frontline', 'department_id' => $support->id]);

        return [
            'division' => $division,
            'otherDivision' => $other,
            'support' => $support,
            'logistics' => $logistics,
            'finance' => $finance,
            'frontline' => $frontline,
            'inTeam' => $this->person('in-team', $support->id, $frontline->id),
            'departmentOnly' => $this->person('department-only', $support->id),
            'teamWithoutDepartment' => $this->person('team-without-department', null, $frontline->id),
            'siblingDepartment' => $this->person('sibling-department', $logistics->id),
            'otherDivisionPerson' => $this->person('other-division', $finance->id),
        ];
    }

    private function person(string $name, ?int $departmentId = null, ?int $teamId = null): User
    {
        return User::factory()->create([
            'name' => $name,
            'is_active' => true,
            'department_id' => $departmentId,
            'team_id' => $teamId,
        ]);
    }

    /** The names actually rendered into the workload table. */
    private function peopleSeenBy(User $viewer, array $query = []): array
    {
        $response = $this->actingAs($viewer)->get('/workload?'.http_build_query($query));
        $response->assertOk();

        return collect($response->viewData('page')['props']['workload']['rows'])
            ->pluck('user.name')->sort()->values()->all();
    }

    private function props(User $viewer): array
    {
        $response = $this->actingAs($viewer)->get('/workload');
        $response->assertOk();

        return $response->viewData('page')['props'];
    }

    public function test_a_division_head_sees_every_department_beneath_them(): void
    {
        $org = $this->org();
        $head = $this->person('division-head');
        $org['division']->update(['head_id' => $head->id]);

        $this->assertSame([
            'department-only',
            'division-head',
            'in-team',
            'sibling-department',
            'team-without-department',
        ], $this->peopleSeenBy($head));
    }

    public function test_a_division_head_does_not_see_another_division(): void
    {
        $org = $this->org();
        $head = $this->person('division-head');
        $org['division']->update(['head_id' => $head->id]);

        $this->assertNotContains('other-division', $this->peopleSeenBy($head));
    }

    public function test_a_department_head_sees_their_department_and_its_teams(): void
    {
        $org = $this->org();
        $head = $this->person('department-head');
        $org['support']->update(['head_id' => $head->id]);

        $this->assertSame([
            'department-head',
            'department-only',
            'in-team',
            // Filed under a team inside this department but carrying no
            // department of their own. The old query lost them.
            'team-without-department',
        ], $this->peopleSeenBy($head));
    }

    public function test_a_department_head_does_not_see_a_sibling_department(): void
    {
        $org = $this->org();
        $head = $this->person('department-head');
        $org['support']->update(['head_id' => $head->id]);

        $seen = $this->peopleSeenBy($head);

        $this->assertNotContains('sibling-department', $seen);
        $this->assertNotContains('other-division', $seen);
    }

    /**
     * The filters narrow the branch; they can never reach outside it. The page
     * does not offer a foreign department, but the query string is the user's
     * to type, so the scope is applied underneath rather than trusted above.
     */
    public function test_a_hand_typed_department_cannot_widen_the_scope(): void
    {
        $org = $this->org();
        $head = $this->person('department-head');
        $org['support']->update(['head_id' => $head->id]);

        $this->assertSame([], $this->peopleSeenBy($head, ['department' => $org['finance']->id]));
    }

    public function test_the_filters_only_offer_units_inside_the_branch(): void
    {
        $org = $this->org();
        $head = $this->person('division-head');
        $org['division']->update(['head_id' => $head->id]);

        $props = $this->props($head);

        $this->assertSame(['Logistics', 'Support'], collect($props['departments'])->pluck('name')->sort()->values()->all());
        $this->assertSame(['Frontline'], collect($props['teams'])->pluck('name')->all());
        $this->assertSame('Operations', $props['scope']);
    }

    public function test_a_department_head_is_told_which_department_they_are_looking_at(): void
    {
        $org = $this->org();
        $head = $this->person('department-head');
        $org['support']->update(['head_id' => $head->id]);

        $this->assertSame('Support', $this->props($head)['scope']);
    }

    /**
     * Leading a team is not a way into this page. A team's load is a management
     * view belonging to whoever runs the department above it.
     */
    public function test_a_team_leader_alone_is_still_refused(): void
    {
        $org = $this->org();
        $leader = $this->person('team-leader');
        $org['frontline']->update(['leader_id' => $leader->id]);

        $this->actingAs($leader)->get('/workload')->assertForbidden();
    }

    /**
     * The permission can still be handed to a team leader deliberately. They
     * get their team, and the page says so rather than leaving a one-team
     * table looking like the whole organisation.
     */
    public function test_a_team_leader_given_the_permission_gets_their_team(): void
    {
        $org = $this->org();
        $leader = $this->person('team-leader');
        $org['frontline']->update(['leader_id' => $leader->id]);
        $leader->givePermissionTo('view-workload');

        $this->assertSame(
            ['in-team', 'team-leader', 'team-without-department'],
            $this->peopleSeenBy($leader->fresh())
        );
        $this->assertSame('Frontline', $this->props($leader->fresh())['scope']);
    }

    public function test_somebody_who_heads_nothing_is_still_refused(): void
    {
        $this->org();

        $this->actingAs($this->person('nobody'))->get('/workload')->assertForbidden();
    }

    public function test_an_admin_still_sees_the_whole_organisation(): void
    {
        $this->org();
        Role::findOrCreate('admin')->syncPermissions(['manage-users', 'view-workload']);

        $admin = $this->person('admin');
        $admin->assignRole('admin');

        $seen = $this->peopleSeenBy($admin);

        $this->assertContains('other-division', $seen);
        $this->assertContains('team-without-department', $seen);
        // Nothing to name when you can see everybody.
        $this->assertNull($this->props($admin)['scope']);
    }

    public function test_the_sidebar_flag_follows_the_same_rule(): void
    {
        $org = $this->org();

        $head = $this->person('division-head');
        $org['division']->update(['head_id' => $head->id]);

        $leader = $this->person('team-leader');
        $org['frontline']->update(['leader_id' => $leader->id]);

        $this->assertTrue($head->fresh()->canViewWorkload());
        $this->assertFalse($leader->fresh()->canViewWorkload());
    }

    /** Appointing somebody mid-session must not leave them locked out by a cache. */
    public function test_a_new_head_is_let_in_without_waiting_for_the_cache(): void
    {
        $org = $this->org();
        $head = $this->person('new-head');

        $this->actingAs($head)->get('/workload')->assertForbidden();

        $org['support']->update(['head_id' => $head->id]);

        $this->actingAs($head->fresh())->get('/workload')->assertOk();
    }
}
