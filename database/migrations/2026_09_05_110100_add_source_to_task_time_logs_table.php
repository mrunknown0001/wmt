<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Where a time entry came from, and whether it may be recalculated.
 *
 * Effort is now generated from the clock, which means most entries are derived
 * and can be worked out again from the segments any time. Three kinds have to
 * be told apart:
 *
 *   motion   — the generator's own work. Recomputed freely.
 *   declared — what somebody said when they paused. A statement about their
 *              own day, so the generator takes it as given and works around it.
 *   manual   — entered by hand: the entries that predate all this, and the ones
 *              an approved request adds after the fact.
 *
 * amended_at is the other half of the guarantee: an entry a person argued for
 * and had approved is never quietly recalculated back to what the clock thinks.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('task_time_logs', function (Blueprint $table) {
            $table->string('source', 10)->default('manual')->after('minutes');
            $table->timestamp('amended_at')->nullable()->after('note');
        });

        // Everything already recorded was typed by a person or stopped by hand.
        DB::table('task_time_logs')->update(['source' => 'manual']);

        Schema::table('task_time_logs', function (Blueprint $table) {
            // The generator's working set: one person, one day, the rows it owns.
            $table->index(['user_id', 'logged_on', 'source']);
        });
    }

    public function down(): void
    {
        Schema::table('task_time_logs', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'logged_on', 'source']);
            $table->dropColumn(['source', 'amended_at']);
        });
    }
};
