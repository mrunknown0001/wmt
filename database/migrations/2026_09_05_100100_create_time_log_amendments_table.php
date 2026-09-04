<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A request to correct time already recorded, and the decision on it.
 *
 * Time logs feed effort reporting and estimate accuracy, so letting people
 * silently rewrite them would make those figures unfalsifiable. But a timer
 * stopped an hour early, or left running overnight, is the ordinary case rather
 * than the exception — refusing to fix it is how the numbers go wrong instead.
 *
 * So a correction is a request with a reason, decided by whoever runs the
 * project, and the row survives the decision: original_minutes is snapshotted
 * at request time, so what the entry used to say is still readable afterwards.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('time_log_amendments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_time_log_id')->constrained('task_time_logs')->cascadeOnDelete();
            $table->foreignId('requested_by')->constrained('users')->cascadeOnDelete();
            // What the entry said when the request was raised. Kept even after
            // the amendment is applied, so the change is legible later.
            $table->unsignedSmallInteger('original_minutes');
            $table->unsignedSmallInteger('requested_minutes');
            $table->text('reason');
            $table->string('status', 20)->default('pending');
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->string('review_note', 500)->nullable();
            $table->timestamps();

            // The two questions asked of this table: what is outstanding on one
            // entry, and what is waiting on a reviewer.
            $table->index(['task_time_log_id', 'status']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('time_log_amendments');
    }
};
