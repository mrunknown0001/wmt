<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Division;
use App\Models\Project;
use App\Models\Task;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The dashboard's Team Workload card, seen from inside the org chart.
 *
 * It was gated on the supervisor role and then queried every active user, so a
 * supervisor read the names and open-task counts of the ten busiest people in
 * the organisation — including divisions they had nothing to do with. It now
 * follows the same OrgScope walk as the overdue card beside it.
 */
class DashboardTeamWorkloadScopeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        Permission::findOrCreate('manage-users');
    }

    private function org(): array
    {
        $division = Division::create(['name' => 'Operations']);
        $otherDivision = Division::create(['name' => 'Corporate']);

        $support = Department::create(['name' => 'Support', 'division_id' => $division->id]);
        $finance = Department::create(['name' => 'Finance', 'division_id' => $otherDivision->id]);
        $frontline = Team::create(['name' => 'Frontline', 'department_id' => $support->id]);

        return [
            'division' => $division,
            'support' => $support,
            'finance' => $finance,
            'frontline' => $frontline,
            'inTeam' => $this->busyPerson('in-team', $support->id, $frontline->id),
            'departmentOnly' => $this->busyPerson('department-only', $support->id),
            'farAway' => $this->busyPerson('far-away', $finance->id),
        ];
    }

    /** Somebody with an open task, so they qualify for the card at all. */
    private function busyPerson(string $name, ?int $departmentId = null, ?int $teamId = null): User
    {
        $user = User::factory()->create([
            'name' => $name,
            'is_active' => true,
            'department_id' => $departmentId,
            'team_id' => $teamId,
        ]);

        $project = Project::create(['name' => "{$name}-project", 'status' => 'active']);
        Task::create([
            'project_id' => $project->id,
            'title' => "{$name}-task",
            'status' => 'in_progress',
            'priority' => 'medium',
            'assigned_to' => $user->id,
        ]);

        return $user;
    }

    /** @return array<int, string> names on the card, or [] when it is absent */
    private function cardFor(User $viewer): array
    {
        $props = $this->actingAs($viewer)->get('/dashboard')->assertOk()
            ->viewData('page')['props'];

        return collect($props['teamWorkload'] ?? [])->pluck('name')->sort()->values()->all();
    }

    public function test_a_department_head_sees_only_their_own_department(): void
    {
        $org = $this->org();
        $head = $this->busyPerson('department-head');
        $org['support']->update(['head_id' => $head->id]);

        // The head is on their own card: a unit's load reads oddly with the
        // person running it cut out of it.
        $this->assertSame(
            ['department-head', 'department-only', 'in-team'],
            $this->cardFor($head->fresh())
        );
    }

    public function test_a_division_head_sees_the_whole_branch_but_not_the_next_one(): void
    {
        $org = $this->org();
        $head = $this->busyPerson('division-head');
        $org['division']->update(['head_id' => $head->id]);

        $seen = $this->cardFor($head->fresh());

        $this->assertContains('in-team', $seen);
        $this->assertContains('department-only', $seen);
        $this->assertNotContains('far-away', $seen);
    }

    public function test_a_team_leader_sees_their_team(): void
    {
        $org = $this->org();
        $leader = $this->busyPerson('team-leader');
        $org['frontline']->update(['leader_id' => $leader->id]);

        $this->assertSame(['in-team', 'team-leader'], $this->cardFor($leader->fresh()));
    }

    /**
     * The bug in one test: the supervisor role by itself is not responsibility
     * for anybody, and used to be a view of the whole organisation.
     */
    public function test_a_supervisor_who_heads_nothing_gets_no_card(): void
    {
        $this->org();
        Role::findOrCreate('supervisor');

        $supervisor = $this->busyPerson('lone-supervisor');
        $supervisor->assignRole('supervisor');

        $this->assertSame([], $this->cardFor($supervisor->fresh()));
    }

    public function test_an_admin_still_sees_the_whole_organisation(): void
    {
        $this->org();
        Role::findOrCreate('admin')->syncPermissions(['manage-users']);

        $admin = $this->busyPerson('admin');
        $admin->assignRole('admin');

        $seen = $this->cardFor($admin->fresh());

        $this->assertContains('far-away', $seen);
        $this->assertContains('in-team', $seen);
    }

    public function test_an_ordinary_user_gets_no_card(): void
    {
        $this->org();

        $this->assertSame([], $this->cardFor($this->busyPerson('nobody')));
    }
}
