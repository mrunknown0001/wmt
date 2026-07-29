<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            // Numbering is opt-in per project, so existing projects are unchanged
            // and tasks carry no identifier unless someone asks for one.
            //
            // A separate flag rather than "prefix is set" — a project may want
            // bare numbers (0001) with no prefix at all, which an inferred flag
            // could not express.
            $table->boolean('task_series_enabled')->default(false);

            // Fixed once numbers have been issued: changing it would leave every
            // number already quoted in a comment or email pointing at a prefix
            // that no longer exists.
            $table->string('task_series_prefix', 20)->nullable();

            // Digits the sequence is padded to: 4 gives TASK-0001.
            $table->unsignedTinyInteger('task_series_padding')->default(4);

            // Next sequence to hand out. Kept on the project rather than derived
            // from max(series_sequence) so deleting the newest task cannot cause
            // its number to be reissued to something else.
            $table->unsignedInteger('task_series_next')->default(1);
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->string('series_number', 40)->nullable()->after('title');
            $table->unsignedInteger('series_sequence')->nullable()->after('series_number');

            // Numbers get quoted in conversation and searched for.
            $table->index('series_number');

            // Two tasks in one project must never share a sequence. Standalone
            // tasks have a null project_id and null sequence, which this index
            // permits any number of.
            $table->unique(['project_id', 'series_sequence'], 'tasks_project_series_unique');
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropUnique('tasks_project_series_unique');
            $table->dropIndex(['series_number']);
            $table->dropColumn(['series_number', 'series_sequence']);
        });

        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn([
                'task_series_enabled',
                'task_series_prefix',
                'task_series_padding',
                'task_series_next',
            ]);
        });
    }
};
