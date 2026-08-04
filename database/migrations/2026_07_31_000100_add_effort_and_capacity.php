<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            // How much work this task represents, in minutes.
            //
            // Minutes rather than hours because half-hours are the common unit
            // and a decimal column invites rounding drift once you start
            // summing hundreds of rows. The UI shows and accepts hours.
            $table->unsignedInteger('estimated_minutes')->nullable()->after('due_time');
        });

        Schema::table('users', function (Blueprint $table) {
            // What this person can absorb on a working day, and which days
            // those are. Both per person: part-timers and weekend shifts are
            // normal in a warehouse, and a single org-wide number would make
            // every capacity figure wrong for them.
            $table->unsignedSmallInteger('daily_capacity_minutes')->default(480); // 8h
            $table->json('working_days')->nullable(); // ISO weekdays; null = Mon-Fri
        });

        Schema::create('task_time_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // Null while a timer is running; set when it stops or when the
            // entry is typed in by hand.
            $table->unsignedInteger('minutes')->nullable();

            // Set only while running. A row with started_at and no minutes is
            // the one live timer for that person.
            $table->timestamp('started_at')->nullable();

            // The day the work counts against, which is not always the day the
            // row was created — someone logging Friday's work on Monday.
            $table->date('logged_on');

            $table->string('note', 255)->nullable();
            $table->timestamps();

            $table->index(['user_id', 'logged_on']);
            $table->index(['task_id', 'logged_on']);
            $table->index('started_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('task_time_logs');

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['daily_capacity_minutes', 'working_days']);
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn('estimated_minutes');
        });
    }
};
