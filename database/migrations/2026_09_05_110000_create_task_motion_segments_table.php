<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The stretches a task was actually being worked.
 *
 * tasks carries only the current state — started, paused now, paused for this
 * long in total — which is enough to report an elapsed figure and nothing else.
 * Effort is generated per day, so the days have to be recoverable: a task
 * started on Monday, paused Monday evening and resumed Wednesday morning has
 * two stretches, and Tuesday is not one of them.
 *
 * A segment is opened when the clock starts or resumes and closed when it is
 * paused or the task is finished. user_id is who the work is credited to,
 * stamped from the assignee at the time, because a task reassigned halfway
 * through should not hand its first week to whoever inherited it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_motion_segments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            // Nullable: an unassigned task can be in motion, it just has nobody
            // to credit. The segment is still recorded — the elapsed time is
            // real — and picks up an owner if one is named before it closes.
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('started_at');
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();

            // The generator's query: everything one person had running across a
            // day. The open-segment lookup rides the same index.
            $table->index(['user_id', 'started_at']);
            $table->index(['task_id', 'ended_at']);
        });

        // Tasks already in motion keep their history rather than starting from
        // nothing: one stretch from the start stamp, ended at the pause if the
        // clock is down, plus the current stretch when it has been resumed.
        $tasks = \Illuminate\Support\Facades\DB::table('tasks')
            ->whereNotNull('started_at')
            ->whereNull('deleted_at')
            ->get(['id', 'assigned_to', 'started_at', 'completed_at', 'motion_paused_at', 'motion_resumed_at', 'status']);

        $now = now();

        foreach ($tasks as $task) {
            $rows = [];
            $closed = $task->completed_at ?? $task->motion_paused_at;

            if ($task->motion_resumed_at) {
                // Stretch one ran from the start to the first pause, which is
                // no longer recorded once a resume has overwritten it — the
                // resume time is the best evidence of where it ended.
                $rows[] = [$task->started_at, $task->motion_resumed_at];
                $rows[] = [$task->motion_resumed_at, $closed];
            } else {
                $rows[] = [$task->started_at, $closed];
            }

            foreach ($rows as [$from, $to]) {
                if ($to !== null && $to <= $from) {
                    continue;
                }

                \Illuminate\Support\Facades\DB::table('task_motion_segments')->insert([
                    'task_id' => $task->id,
                    'user_id' => $task->assigned_to,
                    'started_at' => $from,
                    'ended_at' => $to,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('task_motion_segments');
    }
};
