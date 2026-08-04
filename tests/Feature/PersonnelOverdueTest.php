<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Division;
use App\Models\Project;
use App\Models\Task;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Overdue work across a supervisor's people: the dashboard card, and the full
 * page it hands off to.
 *
 * Time is frozen throughout — "days late" is the whole point of this feature
 * and would otherwise drift with the clock.
 */
class PersonnelOverdueTest extends TestCase
{
    use RefreshDatabase;

    private User $teamLead;
    private User $deptHead;
    private User $divHead;
    private User $member;
    private User $sameTeam;
    private User $otherDept;
    private Project $project;
    private Project $second;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::create(2026, 8, 12, 9));

        $this->teamLead = User::factory()->create(['name' => 'Tara Lead', 'is_active' => true]);
        $this->deptHead = User::factory()->create(['name' => 'Dana Head', 'is_active' => true]);
        $this->divHead = User::factory()->create(['name' => 'Dev Chief', 'is_active' => true]);

        $division = Division::create(['name' => 'Field', 'head_id' => $this->divHead->id]);
        $support = Department::create([
            'name' => 'Support', 'division_id' => $division->id, 'head_id' => $this->deptHead->id,
        ]);
        $elsewhere = Department::create(['name' => 'Elsewhere', 'division_id' => $division->id]);

        $frontline = Team::create([
            'name' => 'Frontline', 'department_id' => $support->id, 'leader_id' => $this->teamLead->id,
        ]);

        $inTeam = ['is_active' => true, 'department_id' => $support->id, 'team_id' => $frontline->id];

        $this->member = User::factory()->create(['name' => 'Mel Member'] + $inTeam);
        $this->sameTeam = User::factory()->create(['name' => 'Sam Same'] + $inTeam);
        $this->otherDept = User::factory()->create([
            'name' => 'Ola Other', 'is_active' => true, 'department_id' => $elsewhere->id,
        ]);

        $this->project = Project::create([
            'name' => 'Alpha', 'status' => 'active', 'owner_id' => $this->teamLead->id,
        ]);
        $this->second = Project::create([
            'name' => 'Beta', 'status' => 'active', 'owner_id' => $this->teamLead->id,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function task(User $assignee, string $due, array $extra = []): Task
    {
        // $extra first — the union operator keeps the left-hand value, so
        // defaults on the left would silently swallow every override.
        return Task::create($extra + [
            'project_id' => $this->project->id,
            'title' => 'Task ' . $due . ' for ' . $assignee->name,
            'status' => 'to_do',
            'priority' => 'medium',
            'assigned_to' => $assignee->id,
            'due_date' => $due,
        ]);
    }

    /**
     * The dashboard's chart block uses MySQL's YEARWEEK, which sqlite has no
     * answer for, so the page cannot render under the test database with charts
     * on. Switching them off keeps these tests about the overdue card — a
     * pre-existing limit of that block, not of this feature.
     */
    private function card(User $viewer): ?array
    {
        $viewer->update(['dashboard_preferences' => ['showCharts' => false]]);

        $card = null;

        $this->actingAs($viewer)
            ->get('/dashboard')
            ->assertOk()
            ->assertInertia(function ($page) use (&$card) {
                $card = $page->toArray()['props']['personnelOverdue'] ?? null;
            });

        return $card;
    }

    private function page(User $viewer): array
    {
        $props = [];

        $this->actingAs($viewer)
            ->get('/my-personnel/overdue')
            ->assertOk()
            ->assertInertia(function ($page) use (&$props) {
                $props = $page->toArray()['props'];
            });

        return $props;
    }

    // ---- the dashboard card ----

    public function test_an_ordinary_member_gets_no_card(): void
    {
        $this->assertNull($this->card($this->member));
    }

    public function test_a_team_leader_sees_their_teams_overdue_work(): void
    {
        $this->task($this->member, '2026-08-10');
        $this->task($this->otherDept, '2026-08-01');   // another department
        $this->task($this->member, '2026-08-20');      // not due yet

        $card = $this->card($this->teamLead);

        $this->assertSame(1, $card['total']);
        $this->assertSame('Mel Member', $card['tasks'][0]['assignee']['name']);
    }

    public function test_a_department_head_sees_the_teams_under_them(): void
    {
        $this->task($this->member, '2026-08-10');
        $this->task($this->otherDept, '2026-08-01');

        $this->assertSame(1, $this->card($this->deptHead)['total']);
    }

    public function test_a_division_head_sees_every_department_in_the_branch(): void
    {
        $this->task($this->member, '2026-08-10');
        $this->task($this->otherDept, '2026-08-01');

        $this->assertSame(2, $this->card($this->divHead)['total']);
    }

    public function test_the_supervisors_own_overdue_work_is_not_in_the_card(): void
    {
        // Their own is already reported by the Overdue stat above it.
        $this->task($this->teamLead, '2026-08-01');
        $this->task($this->member, '2026-08-10');

        $card = $this->card($this->teamLead);

        $this->assertSame(1, $card['total']);
        $this->assertSame('Mel Member', $card['tasks'][0]['assignee']['name']);
    }

    public function test_the_card_stops_at_eight_but_still_reports_the_total(): void
    {
        foreach (range(1, 12) as $i) {
            $this->task($this->member, '2026-08-' . str_pad((string) $i, 2, '0', STR_PAD_LEFT));
        }

        $card = $this->card($this->teamLead);

        $this->assertCount(8, $card['tasks']);
        $this->assertSame(11, $card['total']);   // the 12th is due today, not late
        $this->assertSame(8, $card['preview']);
    }

    public function test_the_longest_outstanding_leads_the_card(): void
    {
        $this->task($this->member, '2026-08-11');
        $this->task($this->member, '2026-07-13');
        $this->task($this->member, '2026-08-05');

        $card = $this->card($this->teamLead);

        $this->assertSame([30, 7, 1], collect($card['tasks'])->pluck('days_late')->all());
        $this->assertSame(30, $card['worstDaysLate']);
    }

    public function test_a_clean_team_gets_a_card_saying_so(): void
    {
        $this->task($this->member, '2026-08-20');

        $card = $this->card($this->teamLead);

        $this->assertSame(0, $card['total']);
        $this->assertSame([], $card['tasks']);
    }

    public function test_finished_work_is_never_overdue(): void
    {
        $this->task($this->member, '2026-08-01', ['status' => 'done']);
        $this->task($this->member, '2026-08-01', ['status' => 'cancelled']);

        $this->assertSame(0, $this->card($this->teamLead)['total']);
    }

    public function test_a_task_due_today_is_not_late(): void
    {
        $this->task($this->member, '2026-08-12');

        $this->assertSame(0, $this->card($this->teamLead)['total']);
    }

    // ---- the dedicated page ----

    public function test_the_page_is_refused_to_somebody_who_supervises_nobody(): void
    {
        $this->actingAs($this->member)->get('/my-personnel/overdue')->assertForbidden();
    }

    public function test_the_page_and_the_card_agree(): void
    {
        foreach (range(1, 12) as $i) {
            $this->task($this->member, '2026-08-' . str_pad((string) $i, 2, '0', STR_PAD_LEFT));
        }

        $card = $this->card($this->teamLead);
        $page = $this->page($this->teamLead);

        // A card promising 11 must not open onto a list of 8.
        $this->assertSame($card['total'], $page['summary']['total']);
        $this->assertCount($page['summary']['total'], $page['tasks']);
    }

    public function test_the_summary_counts_people_and_projects(): void
    {
        $this->task($this->member, '2026-08-10');
        $this->task($this->sameTeam, '2026-08-05');
        $this->task($this->sameTeam, '2026-08-06', ['project_id' => $this->second->id]);

        $summary = $this->page($this->teamLead)['summary'];

        $this->assertSame(3, $summary['total']);
        $this->assertSame(2, $summary['people']);
        $this->assertSame(2, $summary['projects']);
    }

    public function test_the_worst_and_average_delays_are_reported(): void
    {
        $this->task($this->member, '2026-08-11');   // 1 day
        $this->task($this->member, '2026-08-02');   // 10 days
        $this->task($this->member, '2026-08-08');   // 4 days

        $summary = $this->page($this->teamLead)['summary'];

        $this->assertSame(10, $summary['worstDaysLate']);
        $this->assertSame(5, $summary['averageDaysLate']);   // (1+10+4)/3 = 5
    }

    public function test_tasks_are_banded_by_how_late_they_are(): void
    {
        $this->task($this->member, '2026-08-10');   // 2 days   -> 1–3
        $this->task($this->member, '2026-08-07');   // 5 days   -> 4–7
        $this->task($this->member, '2026-07-25');   // 18 days  -> 8–30
        $this->task($this->member, '2026-06-01');   // 72 days  -> over 30

        $buckets = collect($this->page($this->teamLead)['buckets'])->pluck('count', 'key');

        $this->assertSame(1, $buckets['recent']);
        $this->assertSame(1, $buckets['week']);
        $this->assertSame(1, $buckets['month']);
        $this->assertSame(1, $buckets['stale']);
    }

    public function test_the_band_boundaries_land_where_the_labels_say(): void
    {
        $this->task($this->member, '2026-08-09');   // exactly 3 days
        $this->task($this->member, '2026-08-08');   // exactly 4 days
        $this->task($this->member, '2026-08-05');   // exactly 7 days
        $this->task($this->member, '2026-08-04');   // exactly 8 days

        $buckets = collect($this->page($this->teamLead)['buckets'])->pluck('count', 'key');

        $this->assertSame(1, $buckets['recent'], '3 days belongs to 1–3');
        $this->assertSame(2, $buckets['week'], '4 and 7 days belong to 4–7');
        $this->assertSame(1, $buckets['month'], '8 days belongs to 8–30');
    }

    public function test_the_filter_dropdowns_only_offer_what_is_present(): void
    {
        $this->task($this->member, '2026-08-10');
        $this->task($this->sameTeam, '2026-08-09', ['project_id' => $this->second->id]);

        $page = $this->page($this->teamLead);

        $this->assertSame(
            ['Mel Member', 'Sam Same'],
            collect($page['people'])->pluck('name')->sort()->values()->all()
        );
        $this->assertSame(
            ['Alpha', 'Beta'],
            collect($page['projects'])->pluck('name')->sort()->values()->all()
        );
    }

    public function test_each_row_carries_what_the_page_needs(): void
    {
        $this->task($this->member, '2026-08-05', ['priority' => 'urgent']);

        $task = $this->page($this->teamLead)['tasks'][0];

        $this->assertSame(7, $task['days_late']);
        $this->assertSame('week', $task['bucket']);
        $this->assertSame('urgent', $task['priority']);
        $this->assertSame('Alpha', $task['project']['name']);
        $this->assertSame('Mel Member', $task['assignee']['name']);
        $this->assertNotEmpty($task['url']);
    }

    public function test_a_division_head_sees_the_whole_branch_on_the_page(): void
    {
        $this->task($this->member, '2026-08-10');
        $this->task($this->otherDept, '2026-08-01');

        $page = $this->page($this->divHead);

        $this->assertSame(2, $page['summary']['total']);
        $this->assertSame(
            ['Mel Member', 'Ola Other'],
            collect($page['tasks'])->pluck('assignee.name')->sort()->values()->all()
        );
    }

    public function test_a_leader_never_sees_outside_their_scope(): void
    {
        $this->task($this->otherDept, '2026-08-01');

        $page = $this->page($this->teamLead);

        $this->assertSame(0, $page['summary']['total']);
        $this->assertSame([], $page['tasks']);
    }

    public function test_an_administrator_sees_the_whole_organisation(): void
    {
        Permission::findOrCreate('manage-users');
        Role::findOrCreate('admin')->givePermissionTo('manage-users');
        $admin = User::factory()->create(['is_active' => true]);
        $admin->assignRole('admin');

        $this->task($this->member, '2026-08-10');
        $this->task($this->otherDept, '2026-08-01');

        $this->assertSame(2, $this->page($admin)['summary']['total']);
    }

    public function test_deactivated_people_are_left_out(): void
    {
        $this->task($this->member, '2026-08-10');
        $this->member->update(['is_active' => false]);

        $this->assertSame(0, $this->page($this->teamLead)['summary']['total']);
    }
}
