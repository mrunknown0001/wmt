<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What kind of thing a task is.
 *
 * Everything so far has been a piece of work. A meeting is not that — it is an
 * event that produces a record, and the record is the point. Typing the task
 * lets the meeting kind carry minutes without every ordinary task growing a
 * minutes tab it will never use.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->string('task_type', 20)->default('standard')->after('title')->index();
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropIndex(['task_type']);
            $table->dropColumn('task_type');
        });
    }
};
