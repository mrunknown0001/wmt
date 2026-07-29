<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            // Holds the variance for a recurrence, alongside the existing
            // frequency/interval pair:
            //
            //   weekly  { "days": [1,3,5] }                 Mon/Wed/Fri (ISO: 1=Mon)
            //   monthly { "mode": "day_of_month", "day": 15 }
            //   monthly { "mode": "last_day" }
            //   monthly { "mode": "nth_weekday", "week": 2, "weekday": 2 }
            //           week -1 means "last"; weekday is ISO 1..7
            //
            // Null keeps the original behaviour — add one interval to the due
            // date — so existing recurring tasks are untouched.
            $table->json('recurrence_config')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn('recurrence_config');
        });
    }
};
