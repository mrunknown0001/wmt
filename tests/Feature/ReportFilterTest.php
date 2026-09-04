<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The reports filters, now that each of them takes several ids.
 *
 * The interesting cases are the union — two projects means both, not the last
 * one — and the old single-id links, which have to keep working: people
 * bookmark a filtered report and would otherwise open it one day to find it
 * silently unfiltered.
 */
class ReportFilterTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Project $alpha;
    private Project $beta;
    private User $bo;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::create(2026, 8, 20, 9));

        foreach (['view-reports', 'view-projects', 'manage-projects'] as $name) {
            Permission::findOrCreate($name);
        }
        Role::findOrCreate('admin')->syncPermissions(['view-reports', 'view-projects', 'manage-projects']);

        $this->admin = User::factory()->create(['is_active' => true, 'name' => 'Ada']);
        $this->admin->assignRole('admin');
        $this->bo = User::factory()->create(['is_active' => true, 'name' => 'Bo']);

        $this->alpha = Project::create(['name' => 'Alpha', 'status' => 'active', 'owner_id' => $this->admin->id]);
        $this->beta = Project::create(['name' => 'Beta', 'status' => 'active', 'owner_id' => $this->admin->id]);

        // One finished task in each project, on different people.
        $this->done($this->alpha, $this->admin);
        $this->done($this->beta, $this->bo);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function done(Project $project, User $who): Task
    {
        return Task::create([
            'project_id' => $project->id,
            'title' => "Done in {$project->name}",
            'status' => 'done',
            'priority' => 'medium',
            'assigned_to' => $who->id,
            'completed_at' => Carbon::create(2026, 8, 10, 12),
        ]);
    }

    private function completedCount(string $query): int
    {
        $response = $this->actingAs($this->admin)
            ->get("/reports?from=2026-08-01&to=2026-08-31&{$query}")
            ->assertOk();

        return $response->viewData('page')['props']['cycleTime']['count'];
    }

    public function test_no_filter_counts_every_visible_project(): void
    {
        $this->assertSame(2, $this->completedCount(''));
    }

    public function test_a_single_project_id_still_narrows_the_report(): void
    {
        $this->assertSame(1, $this->completedCount("project={$this->alpha->id}"));
    }

    public function test_several_projects_are_a_union_not_the_last_one(): void
    {
        $this->assertSame(2, $this->completedCount("project={$this->alpha->id},{$this->beta->id}"));
    }

    public function test_several_assignees_are_a_union(): void
    {
        $this->assertSame(1, $this->completedCount("assignee={$this->bo->id}"));
        $this->assertSame(2, $this->completedCount("assignee={$this->admin->id},{$this->bo->id}"));
    }

    public function test_project_and_assignee_narrow_together(): void
    {
        // Alpha's task belongs to Ada, so asking for Alpha and Bo matches none.
        $this->assertSame(0, $this->completedCount("project={$this->alpha->id}&assignee={$this->bo->id}"));
    }

    public function test_filters_come_back_as_arrays_for_the_page(): void
    {
        $props = $this->actingAs($this->admin)
            ->get("/reports?project={$this->alpha->id},{$this->beta->id}&assignee={$this->bo->id}")
            ->assertOk()
            ->viewData('page')['props'];

        $this->assertSame([$this->alpha->id, $this->beta->id], $props['filters']['project']);
        $this->assertSame([$this->bo->id], $props['filters']['assignee']);
        $this->assertSame([], $props['filters']['approval_project']);
    }

    public function test_rubbish_in_the_query_string_is_dropped_rather_than_matching_nothing(): void
    {
        $this->assertSame(2, $this->completedCount('project=&assignee='));
        $this->assertSame(2, $this->completedCount('project=abc'));
    }
}
