<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Division;
use App\Models\Project;
use App\Models\Setting;
use App\Models\Task;
use App\Models\Team;
use App\Models\User;
use App\Notifications\TaskEscalatedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * The global escalation ladder: tasks:send-reminders walks overdue tasks up the
 * tiers in admin settings and notifies the audience for the rung reached.
 */
class TaskEscalationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    /** An overdue task on the global ladder, assigned and unfinished. */
    private function overdueTask(int $daysOverdue, array $attributes = []): Task
    {
        $project = Project::factory()->create(['use_global_escalation' => true]);

        return Task::factory()->create(array_merge([
            'project_id' => $project->id,
            'status' => 'to_do',
            'due_date' => now()->subDays($daysOverdue)->startOfDay(),
            'escalation_level' => 0,
        ], $attributes));
    }

    public function test_a_task_one_day_overdue_escalates_to_its_assignee(): void
    {
        $task = $this->overdueTask(1);

        $this->artisan('tasks:send-reminders')->assertSuccessful();

        Notification::assertSentTo(
            $task->assignee,
            TaskEscalatedNotification::class,
        );

        $this->assertSame(1, $task->fresh()->escalation_level);
    }

    public function test_a_task_not_yet_due_does_not_escalate(): void
    {
        $task = $this->overdueTask(-3); // due in three days

        $this->artisan('tasks:send-reminders')->assertSuccessful();

        // Scoped to the escalation notification on purpose: a task due in three
        // days legitimately receives a due-soon reminder from the same command.
        Notification::assertNotSentTo($task->assignee, TaskEscalatedNotification::class);
        $this->assertSame(0, $task->fresh()->escalation_level);
    }

    public function test_escalation_does_not_repeat_at_the_same_level(): void
    {
        $task = $this->overdueTask(1, ['escalation_level' => 1]);

        $this->artisan('tasks:send-reminders')->assertSuccessful();

        Notification::assertNotSentTo($task->assignee, TaskEscalatedNotification::class);
    }

    public function test_the_ladder_is_disabled_by_the_global_setting(): void
    {
        $settings = Setting::current();
        $settings->escalation_enabled = false;
        $settings->save();
        Setting::clearCache();

        $task = $this->overdueTask(10);

        $this->artisan('tasks:send-reminders')->assertSuccessful();

        Notification::assertNotSentTo($task->assignee, TaskEscalatedNotification::class);
        $this->assertSame(0, $task->fresh()->escalation_level);
    }

    public function test_a_completed_task_never_escalates(): void
    {
        $task = $this->overdueTask(30, ['status' => 'done']);

        $this->artisan('tasks:send-reminders')->assertSuccessful();

        Notification::assertNotSentTo($task->assignee, TaskEscalatedNotification::class);
    }

    public function test_level_two_reaches_the_team_leader_and_project_owner(): void
    {
        // No factories for the org models, so build the chain by hand.
        $leader = User::factory()->create(['is_active' => true]);
        $division = Division::create(['name' => 'Ops']);
        $department = Department::create(['name' => 'Support', 'division_id' => $division->id]);
        $team = Team::create([
            'name' => 'Frontline',
            'department_id' => $department->id,
            'leader_id' => $leader->id,
        ]);
        $assignee = User::factory()->create([
            'is_active' => true,
            'team_id' => $team->id,
            'department_id' => $department->id,
        ]);
        $owner = User::factory()->create(['is_active' => true]);

        $project = Project::factory()->create([
            'use_global_escalation' => true,
            'owner_id' => $owner->id,
        ]);

        Task::factory()->create([
            'project_id' => $project->id,
            'assigned_to' => $assignee->id,
            'status' => 'to_do',
            'due_date' => now()->subDays(3)->startOfDay(),
            'escalation_level' => 0,
        ]);

        $this->artisan('tasks:send-reminders')->assertSuccessful();

        Notification::assertSentTo($leader, TaskEscalatedNotification::class);
        Notification::assertSentTo($owner, TaskEscalatedNotification::class);
    }

    // ---------------------------------------------------- vacant escalations

    /**
     * The worst case, and the one that looks like "escalation is broken": an
     * assignee with no team or department, on a project they own. Level 2
     * targets team leader, department head and project owner — and excludes the
     * owner when they are the assignee — so the rung resolves to nobody.
     */
    private function taskWithNobodyToEscalateTo(): Task
    {
        $person = User::factory()->create([
            'is_active' => true, 'team_id' => null, 'department_id' => null,
        ]);

        $project = Project::factory()->create([
            'use_global_escalation' => true,
            'owner_id' => $person->id,
        ]);

        return Task::factory()->create([
            'project_id' => $project->id,
            'assigned_to' => $person->id,
            'status' => 'to_do',
            'due_date' => now()->subDays(5)->startOfDay(), // level 2 on the 1/3/7/14 tiers
            'escalation_level' => 0,
        ]);
    }

    public function test_a_rung_reaching_nobody_is_not_counted_as_an_escalation_sent(): void
    {
        $this->taskWithNobodyToEscalateTo();

        // The count is what the operator sees; reporting "1 escalation" when
        // nothing was delivered is what hid this in the first place.
        $this->artisan('tasks:send-reminders')
            ->expectsOutputToContain('and 0 escalation notifications')
            ->assertSuccessful();
    }

    public function test_a_rung_reaching_nobody_is_logged(): void
    {
        Log::shouldReceive('warning')
            ->once()
            ->withArgs(fn (string $message, array $context = []) =>
                $message === 'Task escalation reached nobody.' && $context['level'] === 2);

        $this->taskWithNobodyToEscalateTo();

        $this->artisan('tasks:send-reminders')->assertSuccessful();
    }

    public function test_the_rung_is_still_recorded_so_it_does_not_block_the_ones_above(): void
    {
        $task = $this->taskWithNobodyToEscalateTo();

        $this->artisan('tasks:send-reminders')->assertSuccessful();

        $this->assertSame(2, $task->fresh()->escalation_level);
    }
}
