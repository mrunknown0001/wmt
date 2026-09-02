<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Division;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The list behind one bar of the executive workload chart.
 *
 * The bar counts somebody's open tasks, so the list has to be the same set —
 * a list that disagreed with the number above it would be worse than none.
 */
class ExecutiveWorkloadDrillTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        Permission::findOrCreate('manage-users');
        Role::findOrCreate('admin');
        Role::findOrCreate('executive');
    }

    private function admin(): User
    {
        $user = User::factory()->create(['is_active' => true]);
        $user->assignRole('admin');

        return $user;
    }

    private function worker(string $name = 'Worker'): User
    {
        return User::factory()->create(['name' => $name, 'is_active' => true]);
    }

    private function task(User $assignee, array $attributes = []): Task
    {
        $project = Project::firstOrCreate(['name' => 'Delivery'], ['status' => 'active']);

        return Task::create(array_merge([
            'project_id' => $project->id,
            'title' => 'A task',
            'status' => 'in_progress',
            'priority' => 'medium',
            'assigned_to' => $assignee->id,
        ], $attributes));
    }

    private function drill(User $viewer, int $userId)
    {
        return $this->actingAs($viewer)->getJson("/executive-dashboard/person-tasks?user={$userId}");
    }

    public function test_the_list_is_the_same_set_the_bar_counts(): void
    {
        $admin = $this->admin();
        $worker = $this->worker();

        $this->task($worker, ['title' => 'Open one']);
        $this->task($worker, ['title' => 'Open two', 'status' => 'to_do']);
        $this->task($worker, ['title' => 'Finished', 'status' => 'done']);
        $this->task($worker, ['title' => 'Dropped', 'status' => 'cancelled']);
        $this->task($this->worker('Somebody else'), ['title' => 'Not theirs']);

        $titles = array_column($this->drill($admin, $worker->id)->assertOk()->json('tasks'), 'title');

        sort($titles);
        $this->assertSame(['Open one', 'Open two'], $titles);
    }

    public function test_overdue_work_comes_first_and_undated_work_last(): void
    {
        $admin = $this->admin();
        $worker = $this->worker();

        $this->task($worker, ['title' => 'No due date', 'due_date' => null]);
        $this->task($worker, ['title' => 'Due next week', 'due_date' => now()->addWeek()->toDateString()]);
        $this->task($worker, ['title' => 'Overdue', 'due_date' => now()->subWeek()->toDateString()]);

        $titles = array_column($this->drill($admin, $worker->id)->assertOk()->json('tasks'), 'title');

        $this->assertSame(['Overdue', 'Due next week', 'No due date'], $titles);
    }

    public function test_a_head_cannot_drill_outside_their_own_branch(): void
    {
        $division = Division::create(['name' => 'Operations']);
        $mine = Department::create(['name' => 'Mine', 'division_id' => $division->id]);
        $theirs = Department::create(['name' => 'Theirs', 'division_id' => $division->id]);

        $head = $this->worker('Head');
        $head->update(['department_id' => $mine->id]);
        $mine->update(['head_id' => $head->id]);

        $mineMember = $this->worker('Mine');
        $mineMember->update(['department_id' => $mine->id]);

        $outsider = $this->worker('Outsider');
        $outsider->update(['department_id' => $theirs->id]);

        $this->task($mineMember);
        $this->task($outsider);

        $this->drill($head->fresh(), $mineMember->id)->assertOk();
        $this->drill($head->fresh(), $outsider->id)->assertNotFound();
    }

    public function test_somebody_outside_the_dashboard_cannot_call_it(): void
    {
        $nobody = User::factory()->create(['is_active' => true]);
        $worker = $this->worker();

        $this->drill($nobody, $worker->id)->assertForbidden();
    }

    public function test_an_executive_can_drill_into_anybody(): void
    {
        $executive = User::factory()->create(['is_active' => true]);
        $executive->assignRole('executive');

        $worker = $this->worker();
        $this->task($worker, ['title' => 'Somewhere in the org']);

        $this->assertSame(
            ['Somewhere in the org'],
            array_column($this->drill($executive, $worker->id)->assertOk()->json('tasks'), 'title')
        );
    }
}
