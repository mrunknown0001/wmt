<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Notifications\TaskAssignedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * A queued notification whose subject is deleted before delivery.
 *
 * The worker restores the notification's models from the job payload. If the
 * task has been removed in between, that lookup throws and the job lands in
 * failed_jobs — for a message that no longer has anything to say. Six of those
 * accumulated on production from delegations deleted before their notification
 * was delivered.
 */
class QueuedNotificationMissingModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_deleted_subject_discards_the_job_instead_of_failing_it(): void
    {
        config(['queue.default' => 'database']);

        $actor = User::factory()->create(['is_active' => true]);
        $recipient = User::factory()->create(['is_active' => true]);
        $task = Task::factory()->create([
            'project_id' => Project::factory()->create()->id,
            'status' => 'to_do',
        ]);

        $recipient->notify(new TaskAssignedNotification($task, $actor));
        // One job per channel — database, broadcast and mail each queue their own.
        $queued = DB::table('jobs')->count();
        $this->assertGreaterThan(0, $queued, 'The notification should be queued, not sent inline.');

        // The task goes away before the worker gets to it.
        $task->forceDelete();

        $this->artisan('queue:work', ['--stop-when-empty' => true])->run();

        $this->assertSame(
            0,
            DB::table('failed_jobs')->count(),
            'A notification about a deleted task should be discarded, not recorded as a failure.'
        );
        $this->assertSame(0, DB::table('jobs')->count(), 'The job should be gone, not left to retry.');
    }

    public function test_it_still_delivers_when_the_subject_is_intact(): void
    {
        // The guard must not swallow ordinary, deliverable notifications.
        config(['queue.default' => 'database']);

        $actor = User::factory()->create(['is_active' => true]);
        $recipient = User::factory()->create(['is_active' => true]);
        $task = Task::factory()->create([
            'project_id' => Project::factory()->create()->id,
            'status' => 'to_do',
        ]);

        $recipient->notify(new TaskAssignedNotification($task, $actor));
        $this->artisan('queue:work', ['--stop-when-empty' => true])->run();

        $this->assertSame(0, DB::table('failed_jobs')->count());
        $this->assertSame(1, $recipient->notifications()->count(), 'The notification should have been delivered.');
    }

    /** Every queued notification carries a model, so every one needs the guard. */
    public function test_every_queued_notification_is_guarded(): void
    {
        $unguarded = [];

        foreach (glob(app_path('Notifications/*.php')) as $file) {
            $source = file_get_contents($file);
            if (!str_contains($source, 'implements ShouldQueue')) {
                continue;
            }
            if (!str_contains($source, 'deleteWhenMissingModels')) {
                $unguarded[] = basename($file);
            }
        }

        $this->assertSame(
            [],
            $unguarded,
            'These queued notifications would fail rather than discard if their subject were deleted: '
                . implode(', ', $unguarded)
        );
    }
}
