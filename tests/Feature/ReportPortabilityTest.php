<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Services\ReportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Reports and dashboard charts, on any driver.
 *
 * These pages leaned on TIMESTAMPDIFF() and YEARWEEK(), which only MySQL has,
 * so neither could be exercised by a test at all — the report page threw
 * "no such function" the moment it was opened. The aggregation now happens in
 * PHP over bounded row sets, and these tests hold the arithmetic to the same
 * answers the SQL gave.
 */
class ReportPortabilityTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Project $project;
    private ?array $chain = null;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::create(2026, 8, 12, 9));

        foreach (['manage-users', 'view-reports', 'view-projects'] as $name) {
            Permission::findOrCreate($name);
        }
        Role::findOrCreate('admin')->syncPermissions(['manage-users', 'view-reports', 'view-projects']);

        $this->admin = User::factory()->create(['is_active' => true]);
        $this->admin->assignRole('admin');

        $this->project = Project::create([
            'name' => 'Alpha', 'status' => 'active', 'owner_id' => $this->admin->id,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** A finished task with an explicit open-to-done span. */
    private function completed(string $createdAt, string $completedAt, string $title = 'T'): Task
    {
        $task = Task::create([
            'project_id' => $this->project->id,
            'title' => $title,
            'status' => 'done',
            'priority' => 'medium',
            'assigned_to' => $this->admin->id,
        ]);

        // Both timestamps are stamped by the model — created_at by Eloquent,
        // completed_at by the saving hook that fires when a task turns done —
        // so the span under test is written straight to the row afterwards.
        Task::whereKey($task->id)->update([
            'created_at' => $createdAt,
            'completed_at' => $completedAt,
        ]);

        return $task->fresh();
    }

    // ---- the page renders at all ----

    public function test_the_reports_page_opens(): void
    {
        $this->completed('2026-08-01 09:00:00', '2026-08-03 17:00:00');

        $this->actingAs($this->admin)->get('/reports')->assertOk();
    }

    public function test_the_dashboard_opens_with_charts_on(): void
    {
        $this->completed('2026-08-01 09:00:00', '2026-08-03 17:00:00');

        $this->admin->update(['dashboard_preferences' => ['showCharts' => true]]);

        $this->actingAs($this->admin)
            ->get('/dashboard')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->has('charts.completionTrend'));
    }

    // ---- cycle time ----

    public function test_cycle_time_measures_whole_hours_open(): void
    {
        // 09:00 Sat 1st to 17:00 Mon 3rd — 56 hours.
        $this->completed('2026-08-01 09:00:00', '2026-08-03 17:00:00');

        $result = ReportService::cycleTime(
            $this->admin, Carbon::create(2026, 7, 1), Carbon::create(2026, 8, 31)
        );

        $this->assertSame(1, $result['count']);
        $this->assertSame(56.0, (float) $result['average_hours']);
    }

    public function test_cycle_time_truncates_part_hours_the_way_the_sql_did(): void
    {
        // 90 minutes is one whole hour to TIMESTAMPDIFF(HOUR, ...).
        $this->completed('2026-08-01 09:00:00', '2026-08-01 10:30:00');

        $result = ReportService::cycleTime(
            $this->admin, Carbon::create(2026, 7, 1), Carbon::create(2026, 8, 31)
        );

        $this->assertSame(1.0, (float) $result['average_hours']);
    }

    public function test_cycle_time_averages_across_tasks(): void
    {
        $this->completed('2026-08-01 00:00:00', '2026-08-01 02:00:00');   // 2h
        $this->completed('2026-08-02 00:00:00', '2026-08-02 08:00:00');   // 8h
        $this->completed('2026-08-03 00:00:00', '2026-08-03 05:00:00');   // 5h

        $result = ReportService::cycleTime(
            $this->admin, Carbon::create(2026, 7, 1), Carbon::create(2026, 8, 31)
        );

        $this->assertSame(3, $result['count']);
        $this->assertSame(5.0, (float) $result['average_hours']);
        $this->assertSame(5.0, (float) $result['median_hours']);
    }

    public function test_cycle_time_is_empty_when_nothing_finished(): void
    {
        $result = ReportService::cycleTime(
            $this->admin, Carbon::create(2026, 7, 1), Carbon::create(2026, 8, 31)
        );

        $this->assertSame(0, $result['count']);
        $this->assertNull($result['average_hours']);
    }

    // ---- throughput ----

    public function test_throughput_buckets_by_iso_week(): void
    {
        // ISO week 32 of 2026 runs Mon 3 Aug – Sun 9 Aug.
        $this->completed('2026-08-01 09:00:00', '2026-08-04 10:00:00', 'Tue wk32');
        $this->completed('2026-08-01 09:00:00', '2026-08-06 10:00:00', 'Thu wk32');
        // Week 33 starts Mon 10 Aug.
        $this->completed('2026-08-01 09:00:00', '2026-08-11 10:00:00', 'Tue wk33');

        $weeks = ReportService::throughput(
            $this->admin, Carbon::create(2026, 7, 1), Carbon::create(2026, 8, 31)
        );

        $this->assertCount(2, $weeks);
        $this->assertSame(2, $weeks[0]['total']);
        $this->assertSame(1, $weeks[1]['total']);
    }

    public function test_each_bucket_is_labelled_with_its_earliest_completion(): void
    {
        $this->completed('2026-08-01 09:00:00', '2026-08-06 10:00:00', 'Thu');
        $this->completed('2026-08-01 09:00:00', '2026-08-04 10:00:00', 'Tue');

        $weeks = ReportService::throughput(
            $this->admin, Carbon::create(2026, 7, 1), Carbon::create(2026, 8, 31)
        );

        // MIN(DATE(completed_at)) — the Tuesday, though it was inserted second.
        $this->assertSame('2026-08-04', $weeks[0]['week']);
    }

    public function test_weeks_come_back_in_order_across_a_year_boundary(): void
    {
        // 31 Dec 2025 is a Wednesday in ISO week 2026-01; 28 Dec 2025 is a
        // Sunday, the last day of ISO week 2025-52. String-sorted keys have to
        // put the 2025 week first.
        $this->completed('2025-12-01 09:00:00', '2025-12-28 10:00:00', 'wk2025-52');
        $this->completed('2025-12-01 09:00:00', '2025-12-31 10:00:00', 'wk2026-01');

        $weeks = ReportService::throughput(
            $this->admin, Carbon::create(2025, 12, 1), Carbon::create(2026, 1, 31)
        );

        $this->assertSame(['2025-12-28', '2025-12-31'], collect($weeks)->pluck('week')->all());
    }

    // ---- on-time rate ----
    //
    // The deadline expression built the due timestamp with CONCAT(), which is
    // MySQL only. These pin the boundary the rewritten expression has to keep.

    /** A finished task with a deadline as well as a completion time. */
    private function completedAgainst(string $completedAt, string $dueDate, ?string $dueTime = null): Task
    {
        $task = Task::create([
            'project_id' => $this->project->id,
            'title' => 'Due ' . $dueDate . ' ' . ($dueTime ?? 'end of day'),
            'status' => 'done',
            'priority' => 'medium',
            'assigned_to' => $this->admin->id,
            'due_date' => $dueDate,
            'due_time' => $dueTime,
        ]);

        Task::whereKey($task->id)->update(['completed_at' => $completedAt]);

        return $task->fresh();
    }

    private function onTimeRate(): array
    {
        return ReportService::onTime(
            $this->admin, Carbon::create(2026, 7, 1), Carbon::create(2026, 8, 31)
        );
    }

    public function test_with_no_due_time_the_deadline_is_the_end_of_the_day(): void
    {
        $this->completedAgainst('2026-08-10 23:58:00', '2026-08-10');

        $result = $this->onTimeRate();

        $this->assertSame(1, $result['total']);
        $this->assertSame(1, $result['on_time']);
    }

    public function test_finishing_the_next_morning_is_late(): void
    {
        $this->completedAgainst('2026-08-11 08:00:00', '2026-08-10');

        $this->assertSame(0, $this->onTimeRate()['on_time']);
    }

    public function test_a_due_time_moves_the_deadline_to_that_hour(): void
    {
        // Same day as the due date, but after the hour it was wanted.
        $this->completedAgainst('2026-08-10 15:00:00', '2026-08-10', '14:00:00');

        $result = $this->onTimeRate();

        $this->assertSame(1, $result['total']);
        $this->assertSame(0, $result['on_time']);
    }

    public function test_finishing_before_the_due_time_is_on_time(): void
    {
        $this->completedAgainst('2026-08-10 13:00:00', '2026-08-10', '14:00:00');

        $this->assertSame(1, $this->onTimeRate()['on_time']);
    }

    // ---- approver turnaround ----

    /**
     * The chain a step instance hangs off, created once and reused.
     *
     * @return array{item: int, step: int}
     */
    private function approvalChain(): array
    {
        // An instance property, not a static: RefreshDatabase truncates
        // between tests, so cached ids would point at rows that no longer
        // exist by the second test in the class.
        if ($this->chain !== null) {
            return $this->chain;
        }

        $projectId = DB::table('approval_projects')->insertGetId([
            'name' => 'Requests', 'status' => 'active',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $itemId = DB::table('approval_items')->insertGetId([
            'approval_project_id' => $projectId, 'title' => 'Item', 'status' => 'approved',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $chainId = DB::table('approval_chains')->insertGetId([
            'approval_project_id' => $projectId, 'name' => 'Default',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $versionId = DB::table('approval_chain_versions')->insertGetId([
            'approval_chain_id' => $chainId, 'version_number' => 1, 'is_current' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $stepId = DB::table('approval_steps')->insertGetId([
            'approval_chain_version_id' => $versionId, 'step_number' => 1,
            'name' => 'Review', 'approver_type' => 'specific_user',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return $this->chain = ['item' => $itemId, 'step' => $stepId];
    }

    private function decision(User $approver, string $activatedAt, string $decidedAt): void
    {
        $chain = $this->approvalChain();

        $instanceId = DB::table('approval_step_instances')->insertGetId([
            'approval_item_id' => $chain['item'],
            'approval_step_id' => $chain['step'],
            'step_number' => 1,
            'status' => 'approved',
            'activated_at' => $activatedAt,
            'created_at' => $activatedAt,
            'updated_at' => $activatedAt,
        ]);

        DB::table('approval_step_decisions')->insert([
            'approval_step_instance_id' => $instanceId,
            'decided_by' => $approver->id,
            'decision' => 'approved',
            'decided_at' => $decidedAt,
            'created_at' => $decidedAt,
            'updated_at' => $decidedAt,
        ]);
    }

    public function test_approver_turnaround_averages_hours_per_person(): void
    {
        $approver = User::factory()->create(['name' => 'Alex Approver', 'is_active' => true]);

        $this->decision($approver, '2026-08-01 09:00:00', '2026-08-01 11:00:00');   // 2h
        $this->decision($approver, '2026-08-02 09:00:00', '2026-08-02 15:00:00');   // 6h
        $this->decision($approver, '2026-08-03 09:00:00', '2026-08-03 13:00:00');   // 4h

        $rows = ReportService::approverTurnaround(
            Carbon::create(2026, 7, 1), Carbon::create(2026, 8, 31)
        );

        $this->assertCount(1, $rows);
        $this->assertSame('Alex Approver', $rows[0]['name']);
        $this->assertSame(3, $rows[0]['decisions']);
        $this->assertSame(4.0, $rows[0]['average_hours']);
        $this->assertSame(6, $rows[0]['slowest_hours']);
    }

    public function test_approvers_below_the_minimum_are_dropped(): void
    {
        $busy = User::factory()->create(['name' => 'Busy', 'is_active' => true]);
        $quiet = User::factory()->create(['name' => 'Quiet', 'is_active' => true]);

        foreach (range(1, 3) as $i) {
            $this->decision($busy, "2026-08-0{$i} 09:00:00", "2026-08-0{$i} 10:00:00");
        }
        $this->decision($quiet, '2026-08-01 09:00:00', '2026-08-01 10:00:00');

        $rows = ReportService::approverTurnaround(
            Carbon::create(2026, 7, 1), Carbon::create(2026, 8, 31), [], 3
        );

        $this->assertSame(['Busy'], collect($rows)->pluck('name')->all());
    }

    public function test_the_slowest_approver_is_listed_first(): void
    {
        $fast = User::factory()->create(['name' => 'Fast', 'is_active' => true]);
        $slow = User::factory()->create(['name' => 'Slow', 'is_active' => true]);

        foreach (range(1, 3) as $i) {
            $this->decision($fast, "2026-08-0{$i} 09:00:00", "2026-08-0{$i} 10:00:00");   // 1h
            $this->decision($slow, "2026-08-0{$i} 09:00:00", "2026-08-0{$i} 20:00:00");   // 11h
        }

        $rows = ReportService::approverTurnaround(
            Carbon::create(2026, 7, 1), Carbon::create(2026, 8, 31), [], 3
        );

        $this->assertSame(['Slow', 'Fast'], collect($rows)->pluck('name')->all());
    }

    public function test_decisions_outside_the_window_are_ignored(): void
    {
        $approver = User::factory()->create(['name' => 'Alex', 'is_active' => true]);

        foreach (range(1, 3) as $i) {
            $this->decision($approver, "2026-08-0{$i} 09:00:00", "2026-08-0{$i} 10:00:00");
        }
        $this->decision($approver, '2026-05-01 09:00:00', '2026-05-01 23:00:00');

        $rows = ReportService::approverTurnaround(
            Carbon::create(2026, 7, 1), Carbon::create(2026, 8, 31), [], 3
        );

        // The 14-hour May decision would have dragged the average up.
        $this->assertSame(3, $rows[0]['decisions']);
        $this->assertSame(1.0, $rows[0]['average_hours']);
    }
}
