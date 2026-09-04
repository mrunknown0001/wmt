<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Every project tracks the clock unless it says otherwise.
 *
 * The flag was a display preference: show two extra columns, or don't. Now that
 * effort is generated from the clock, it decides whether a project records any
 * effort at all — and left off, as it was on sixty of sixty-one projects, it
 * would have quietly emptied the reports.
 *
 * Existing projects are switched on rather than left behind, and the flag stays
 * for anyone who wants a project to sit this out.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->boolean('show_time_in_motion')->default(true)->change();
        });

        DB::table('projects')->where('show_time_in_motion', false)->update(['show_time_in_motion' => true]);
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->boolean('show_time_in_motion')->default(false)->change();
        });
    }
};
