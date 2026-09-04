<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Putting a task's clock down for the night.
 *
 * started_at alone measures wall-clock, which is honest for a task finished the
 * same afternoon and nonsense for one that spans a fortnight: it counts every
 * night and weekend as time in motion. These three columns let the clock be
 * paused, so elapsed becomes the stretches the task was actually being worked.
 *
 * motion_paused_at is the current pause (null while running), motion_resumed_at
 * is when the present stretch began, and motion_paused_minutes accumulates the
 * pauses already closed — kept as a running total rather than a table of spans
 * because nothing needs to read the individual pauses back, only their sum.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->timestamp('motion_paused_at')->nullable()->after('started_at');
            $table->timestamp('motion_resumed_at')->nullable()->after('motion_paused_at');
            $table->unsignedInteger('motion_paused_minutes')->default(0)->after('motion_resumed_at');
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn(['motion_paused_at', 'motion_resumed_at', 'motion_paused_minutes']);
        });
    }
};
