<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Division;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Services\WorkloadService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

/**
 * The drill-down behind a cell on the Workload grid.
 *
 * Its job is to explain a number, so the test that matters most is that the
 * parts add up to the number they explain — computed by the same service, but
 * asserted independently here so a change to one cannot quietly follow the
 * other.
 */
class WorkloadBreakdownTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        Permission::findOrCreate('view-workload');
        Permission::findOrCreate('manage-users');
    }

    private function admin(): User
    {
        $user = User::factory()->create(['is_active' => true]);
        $user->givePermissionTo(['view-workload', 'manage-users']);

        return $user;
    }

    private function worker(string $name = 'Worker'): User
    {
        return User::factory()->create([
            'name' => $name,
            'is_active' => true,
            'daily_capacity_minutes' => 480,
        ]);
    }

    private function task(User $assignee, array $attributes = []): Task
    {
        $project = Project::firstOrCreate(
            ['name' => 'Delivery'],
            ['status' => 'active']
        );

        return Task::create(array_merge([
            'project_id' => $project->id,
            'title' => 'A task',
            'status' => 'in_progress',
            'priority' => 'medium',
            'assigned_to' => $assignee->id,
        ], $attributes));
    }

    private function breakdown(User $viewer, array $query)
    {
        return $this->actingAs($viewer)->getJson('/workload/breakdown?'.http_build_query($query));
    }

    public function test_the_parts_add_up_to_the_number_they_explain(): void
    {
        $admin = $this->admin();
        $worker = $this->worker();

        $monday = Carbon::parse('2026-09-07');   // a Monday
        $friday = $monday->copy()->addDays(4);

        // 8 hours across Monday to Friday: 96 minutes a day.
        $this->task($worker, [
            'title' => 'Spread across the week',
            'start_date' => $monday->toDateString(),
            'due_date' => $friday->toDateString(),
            'estimated_minutes' => 480,
        ]);
        // Two hours landing squarely on the Tuesday.
        $this->task($worker, [
            'title' => 'Just the Tuesday',
            'due_date' => $monday->copy()->addDay()->toDateString(),
            'estimated_minutes' => 120,
        ]);

        $tuesday = $monday->copy()->addDay()->toDateString();

        $response = $this->breakdown($admin, [
            'user' => $worker->id,
            'from' => $monday->toDateString(),
            'to' => $friday->toDateString(),
            'date' => $tuesday,
        ])->assertOk();

        $rows = $response->json('estimated');
        $this->assertCount(2, $rows);
        $this->assertSame(96 + 120, array_sum(array_column($rows, 'minutes')));
        $this->assertSame(96 + 120, $response->json('total_minutes'));

        // And that is the number the grid itself shows for that day.
        $grid = WorkloadService::build(collect([$worker->fresh()]), $monday, $friday);
        $cell = collect($grid['rows'][0]['cells'])->firstWhere('date', $tuesday);
        $this->assertSame($cell['minutes'], $response->json('total_minutes'));
    }

    public function test_a_task_reaching_past_the_window_only_brings_its_own_days(): void
    {
        $admin = $this->admin();
        $worker = $this->worker();

        $monday = Carbon::parse('2026-09-07');

        // Ten working days of two hours each, but the window is only the first week.
        $this->task($worker, [
            'title' => 'Runs past the window',
            'start_date' => $monday->toDateString(),
            'due_date' => $monday->copy()->addDays(11)->toDateString(),
            'estimated_minutes' => 1200,
        ]);

        $response = $this->breakdown($admin, [
            'user' => $worker->id,
            'from' => $monday->toDateString(),
            'to' => $monday->copy()->addDays(4)->toDateString(),
        ])->assertOk();

        $row = $response->json('estimated.0');

        $this->assertSame(1200, $row['estimated_minutes']);
        $this->assertLessThan(1200, $row['minutes']);
        $this->assertSame(5, $row['days_in_scope']);
    }

    public function test_unestimated_and_undated_work_is_listed_separately(): void
    {
        $admin = $this->admin();
        $worker = $this->worker();

        $monday = Carbon::parse('2026-09-07');

        $this->task($worker, [
            'title' => 'No estimate',
            'due_date' => $monday->toDateString(),
            'estimated_minutes' => null,
        ]);
        $this->task($worker, [
            'title' => 'No due date',
            'due_date' => null,
            'estimated_minutes' => 300,
        ]);

        $response = $this->breakdown($admin, [
            'user' => $worker->id,
            'from' => $monday->toDateString(),
            'to' => $monday->copy()->addDays(4)->toDateString(),
        ])->assertOk();

        $this->assertSame(['No estimate'], array_column($response->json('unestimated'), 'title'));
        $this->assertSame([], $response->json('estimated'));
        // Work with no due date touches no date, so the window query cannot
        // reach it; it is fetched on its own or it would vanish from a page
        // whose whole job is to account for somebody's time.
        $this->assertSame(['No due date'], array_column($response->json('undated'), 'title'));
    }

    public function test_a_head_cannot_drill_into_somebody_outside_their_branch(): void
    {
        $division = Division::create(['name' => 'Operations']);
        $mine = Department::create(['name' => 'Mine', 'division_id' => $division->id]);
        $theirs = Department::create(['name' => 'Theirs', 'division_id' => $division->id]);

        $head = $this->worker('Head');
        $head->update(['department_id' => $mine->id]);
        $mine->update(['head_id' => $head->id]);

        $outsider = $this->worker('Outsider');
        $outsider->update(['department_id' => $theirs->id]);

        $monday = Carbon::parse('2026-09-07');

        $this->breakdown($head->fresh(), [
            'user' => $outsider->id,
            'from' => $monday->toDateString(),
            'to' => $monday->copy()->addDays(4)->toDateString(),
        ])->assertNotFound();
    }

    public function test_somebody_who_cannot_see_the_page_cannot_call_it(): void
    {
        $nobody = User::factory()->create(['is_active' => true]);
        $worker = $this->worker();

        $this->breakdown($nobody, [
            'user' => $worker->id,
            'from' => '2026-09-07',
            'to' => '2026-09-11',
        ])->assertForbidden();
    }

    public function test_the_project_filter_narrows_the_breakdown_too(): void
    {
        $admin = $this->admin();
        $worker = $this->worker();
        $monday = Carbon::parse('2026-09-07');

        $other = Project::create(['name' => 'Something else', 'status' => 'active']);

        $this->task($worker, [
            'title' => 'In Delivery',
            'due_date' => $monday->toDateString(),
            'estimated_minutes' => 60,
        ]);
        $this->task($worker, [
            'title' => 'In the other project',
            'project_id' => $other->id,
            'due_date' => $monday->toDateString(),
            'estimated_minutes' => 60,
        ]);

        $response = $this->breakdown($admin, [
            'user' => $worker->id,
            'from' => $monday->toDateString(),
            'to' => $monday->copy()->addDays(4)->toDateString(),
            'date' => $monday->toDateString(),
            'project' => $other->id,
        ])->assertOk();

        $this->assertSame(['In the other project'], array_column($response->json('estimated'), 'title'));
        $this->assertSame(60, $response->json('total_minutes'));
    }
}
