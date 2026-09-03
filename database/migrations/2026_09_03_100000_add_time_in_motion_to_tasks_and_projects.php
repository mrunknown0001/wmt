<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * When work actually began, so elapsed time can be told from planned dates.
 *
 * due_date and start_date are a plan. completed_at already records when a task
 * was closed for real; started_at is the other half of that pair, and the two
 * together are what "time in motion" measures — wall-clock from the moment
 * somebody picked the task up to the moment they put it down.
 *
 * Deliberately not the same thing as the time logs: those record effort spent,
 * which is a smaller number than the span a task sat open.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->timestamp('started_at')->nullable()->after('completed_at');
        });

        Schema::table('projects', function (Blueprint $table) {
            // Off by default: a project that does not track when work begins
            // should not grow two columns of dashes.
            $table->boolean('show_time_in_motion')->default(false)->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn('started_at');
        });

        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn('show_time_in_motion');
        });
    }
};
