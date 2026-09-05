<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Corrections can now ask for an entry that does not exist yet.
 *
 * With the timer gone, "I worked Thursday and never started the clock" has no
 * row to amend — and no way to be recorded at all unless the request itself can
 * carry the date. So an amendment comes in two kinds: change what an entry says,
 * or add one that is missing. Both are decided by the same person, on the same
 * page, and leave the same trail.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('time_log_amendments', function (Blueprint $table) {
            // An addition has no entry to point at until it is approved, at
            // which point the row it created is linked here.
            $table->foreignId('task_time_log_id')->nullable()->change();
            $table->string('kind', 10)->default('amend')->after('task_time_log_id');
            // Only an addition carries these: which task, and which day.
            $table->foreignId('task_id')->nullable()->after('kind')->constrained()->cascadeOnDelete();
            $table->date('logged_on')->nullable()->after('task_id');
        });

        DB::table('time_log_amendments')->update(['kind' => 'amend']);
    }

    public function down(): void
    {
        Schema::table('time_log_amendments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('task_id');
            $table->dropColumn(['kind', 'logged_on']);
        });
    }
};
