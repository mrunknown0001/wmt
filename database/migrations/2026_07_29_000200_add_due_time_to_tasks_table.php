<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            // Optional time-of-day for the due date.
            //
            // Kept separate rather than widening due_date to a datetime: that
            // column is compared with whereDate(), endOfDay() and diffInDays()
            // across reminders, escalation and the dashboards, and giving it a
            // time component would shift all of that. Null means "no particular
            // time", which is not the same as midnight.
            $table->time('due_time')->nullable()->after('due_date');
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn('due_time');
        });
    }
};
