<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Division;
use App\Models\Project;
use App\Models\Task;
use App\Models\Team;
use App\Models\TaskDelegation;
use App\Models\User;
use App\Services\OrgScope;
use App\Services\TaskDelegationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * My Personnel: the people a head or leader oversees, laid out as the org chart
 * is, with each name linking through to that person's overview.
 */
class MyPersonnelTest extends TestCase
{
    use RefreshDatabase;

    private User $teamLead;
    private User $deptHead;
    private User $divHead;
    private User $member;
    private User $otherMember;
    private User $outsider;
    private Division $division;
    private Department $support;
    private Department $elsewhere;
    private Team $frontline;

    /**
     *   Division "Field"          head: divHead
     *     Department "Support"    head: deptHead
     *       Team "Frontline"      leader: teamLead
     *         member
     *       (deskBound — in Support, in no team)
     *     Department "Elsewhere"
     *       Team "Other"
     *         outsider
     */
    protected function setUp(): void
    {
        parent::setUp();

        Notification::fake();

        $this->teamLead = User::factory()->create(['name' => 'Tara Lead', 'is_active' => true]);
        $this->deptHead = User::factory()->create(['name' => 'Dana Head', 'is_active' => true]);
        $this->divHead = User::factory()->create(['name' => 'Dev Chief', 'is_active' => true]);

        $this->division = Division::create(['name' => 'Field', 'head_id' => $this->divHead->id]);

        $this->support = Department::create([
            'name' => 'Support', 'division_id' => $this->division->id, 'head_id' => $this->deptHead->id,
        ]);
        $this->elsewhere = Department::create([
            'name' => 'Elsewhere', 'division_id' => $this->division->id,
        ]);

        $this->frontline = Team::create([
            'name' => 'Frontline', 'department_id' => $this->support->id, 'leader_id' => $this->teamLead->id,
        ]);
        $otherTeam = Team::create(['name' => 'Other', 'department_id' => $this->elsewhere->id]);

        $this->member = User::factory()->create([
            'name' => 'Mel Member', 'is_active' => true,
            'department_id' => $this->support->id, 'team_id' => $this->frontline->id,
        ]);

        // In the department, in no team — the person a naive tree loses.
        $this->otherMember = User::factory()->create([
            'name' => 'Desk Bound', 'is_active' => true,
            'department_id' => $this->support->id, 'team_id' => null,
        ]);

        $this->outsider = User::factory()->create([
            'name' => 'Otto Outsider', 'is_active' => true,
            'department_id' => $this->elsewhere->id, 'team_id' => $otherTeam->id,
        ]);
    }

    private function units($page): array
    {
        return $page->toArray()['props']['units'];
    }

    /** Every person named anywhere in the tree. */
    private function names(array $units): array
    {
        $names = [];

        $walk = function (array $nodes) use (&$walk, &$names) {
            foreach ($nodes as $node) {
                foreach ($node['members'] as $member) {
                    $names[] = $member['name'];
                }
                $walk($node['children']);
            }
        };

        $walk($units);
        sort($names);

        return $names;
    }

    // ---- who gets the page ----

    public function test_somebody_who_heads_nothing_is_refused(): void
    {
        $this->actingAs($this->member)->get('/my-personnel')->assertForbidden();
    }

    public function test_a_team_leader_gets_in(): void
    {
        $this->actingAs($this->teamLead)->get('/my-personnel')->assertOk();
    }

    // ---- what each one sees ----

    public function test_a_team_leader_sees_their_team_and_nobody_else(): void
    {
        $this->actingAs($this->teamLead)
            ->get('/my-personnel')
            ->assertOk()
            ->assertInertia(function ($page) {
                $units = $this->units($page);

                $this->assertCount(1, $units);
                $this->assertSame('team', $units[0]['type']);
                $this->assertSame('Frontline', $units[0]['name']);
                $this->assertSame(['Mel Member'], $this->names($units));
            });
    }

    public function test_a_department_head_sees_the_department_with_its_teams_nested(): void
    {
        $this->actingAs($this->deptHead)
            ->get('/my-personnel')
            ->assertOk()
            ->assertInertia(function ($page) {
                $units = $this->units($page);

                $this->assertCount(1, $units);
                $this->assertSame('department', $units[0]['type']);
                $this->assertSame('Support', $units[0]['name']);

                // The team sits under the department, not beside it.
                $this->assertCount(1, $units[0]['children']);
                $this->assertSame('Frontline', $units[0]['children'][0]['name']);

                $this->assertSame(['Desk Bound', 'Mel Member'], $this->names($units));
            });
    }

    public function test_somebody_in_no_team_still_appears_under_their_department(): void
    {
        $this->actingAs($this->deptHead)
            ->get('/my-personnel')
            ->assertOk()
            ->assertInertia(function ($page) {
                $direct = collect($this->units($page)[0]['members'])->pluck('name')->all();

                $this->assertSame(['Desk Bound'], $direct);
            });
    }

    public function test_a_division_head_sees_the_whole_branch(): void
    {
        $this->actingAs($this->divHead)
            ->get('/my-personnel')
            ->assertOk()
            ->assertInertia(function ($page) {
                $units = $this->units($page);

                $this->assertCount(1, $units);
                $this->assertSame('division', $units[0]['type']);

                // Both departments hang off it.
                $departments = collect($units[0]['children'])->pluck('name')->sort()->values()->all();
                $this->assertSame(['Elsewhere', 'Support'], $departments);

                $this->assertSame(
                    ['Desk Bound', 'Mel Member', 'Otto Outsider'],
                    $this->names($units)
                );
            });
    }

    public function test_a_unit_is_not_repeated_when_it_sits_inside_another(): void
    {
        // One person leading the team, heading its department and its division:
        // the tree should still be a single division, not three top-level cards.
        $this->frontline->update(['leader_id' => $this->divHead->id]);
        $this->support->update(['head_id' => $this->divHead->id]);

        $this->actingAs($this->divHead)
            ->get('/my-personnel')
            ->assertOk()
            ->assertInertia(function ($page) {
                $units = $this->units($page);

                $this->assertCount(1, $units);
                $this->assertSame('division', $units[0]['type']);
            });
    }

    public function test_a_leader_of_two_unrelated_teams_gets_both(): void
    {
        Team::where('name', 'Other')->update(['leader_id' => $this->teamLead->id]);

        $this->actingAs($this->teamLead)
            ->get('/my-personnel')
            ->assertOk()
            ->assertInertia(function ($page) {
                $names = collect($this->units($page))->pluck('name')->sort()->values()->all();

                $this->assertSame(['Frontline', 'Other'], $names);
            });
    }

    public function test_deactivated_people_are_left_out(): void
    {
        $this->member->update(['is_active' => false]);

        $this->actingAs($this->teamLead)
            ->get('/my-personnel')
            ->assertOk()
            ->assertInertia(fn ($page) => $this->assertSame([], $this->names($this->units($page))));
    }

    // ---- what each row carries ----

    public function test_open_and_overdue_counts_are_shown(): void
    {
        $project = Project::create([
            'name' => 'Work', 'status' => 'active', 'owner_id' => $this->teamLead->id,
        ]);

        $make = fn (array $extra) => Task::create([
            'project_id' => $project->id, 'title' => 'T', 'priority' => 'medium',
            'assigned_to' => $this->member->id,
        ] + $extra);

        $make(['status' => 'to_do', 'due_date' => now()->subDays(3)->toDateString()]);
        $make(['status' => 'in_progress', 'due_date' => now()->addDays(3)->toDateString()]);
        $make(['status' => 'done', 'due_date' => now()->subDays(9)->toDateString()]);

        $this->actingAs($this->teamLead)
            ->get('/my-personnel')
            ->assertOk()
            ->assertInertia(function ($page) {
                $person = $this->units($page)[0]['members'][0];

                // The finished one counts as neither.
                $this->assertSame(2, $person['open_tasks']);
                $this->assertSame(1, $person['overdue_tasks']);
            });
    }

    public function test_somebody_on_cover_is_flagged(): void
    {
        $delegation = TaskDelegation::create([
            'user_id' => $this->member->id,
            'starts_on' => now()->subDay()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
            'status' => TaskDelegation::SCHEDULED,
        ]);
        $delegation->delegates()->attach($this->otherMember->id, ['position' => 0]);
        TaskDelegationService::activate($delegation->fresh('delegates'));

        $this->actingAs($this->teamLead)
            ->get('/my-personnel')
            ->assertOk()
            ->assertInertia(function ($page) {
                $cover = $page->toArray()['props']['coveredBy'];

                $this->assertArrayHasKey($this->member->id, $cover);
                $this->assertSame(['Desk Bound'], $cover[$this->member->id]['delegates']);
            });
    }

    // ---- the link through to the overview ----

    public function test_a_team_leader_may_open_their_members_overview(): void
    {
        $this->actingAs($this->teamLead)
            ->get("/users/{$this->member->id}")
            ->assertOk();
    }

    public function test_a_department_head_may_open_an_overview_for_somebody_in_no_team(): void
    {
        $this->actingAs($this->deptHead)
            ->get("/users/{$this->otherMember->id}")
            ->assertOk();
    }

    /**
     * Somebody filed against a team but never given a department.
     *
     * The tree reaches them through the team, so the overview has to as well —
     * otherwise My Personnel would list a name that 403s when clicked.
     */
    public function test_every_name_listed_can_actually_be_opened(): void
    {
        $strays = User::factory()->create([
            'name' => 'Stray', 'is_active' => true,
            'department_id' => null, 'team_id' => $this->frontline->id,
        ]);

        foreach ([$this->teamLead, $this->deptHead, $this->divHead] as $viewer) {
            $listed = collect(OrgScope::manageablePeopleIds($viewer));

            $this->assertTrue($listed->contains($strays->id), 'expected the stray to be listed');

            $this->actingAs($viewer)
                ->get("/users/{$strays->id}")
                ->assertOk();
        }
    }

    public function test_a_leader_still_cannot_open_somebody_elses_overview(): void
    {
        $this->actingAs($this->teamLead)
            ->get("/users/{$this->outsider->id}")
            ->assertForbidden();
    }

    // ---- admins ----

    public function test_an_administrator_sees_the_whole_org(): void
    {
        Permission::findOrCreate('manage-users');
        Role::findOrCreate('admin')->givePermissionTo('manage-users');
        $admin = User::factory()->create(['is_active' => true]);
        $admin->assignRole('admin');

        $this->actingAs($admin)
            ->get('/my-personnel')
            ->assertOk()
            ->assertInertia(function ($page) {
                $this->assertSame(
                    ['Desk Bound', 'Mel Member', 'Otto Outsider'],
                    $this->names($this->units($page))
                );
            });
    }
}
