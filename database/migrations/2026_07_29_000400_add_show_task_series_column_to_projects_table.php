<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            // Whether the Series column appears in the task list, for everyone
            // on the project. Set by the owner or a project admin.
            //
            // Defaults to true: a project that has switched numbering on wants
            // to see the numbers. It only has any effect where numbering is
            // enabled, so this changes nothing for projects that never opt in.
            $table->boolean('show_task_series_column')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn('show_task_series_column');
        });
    }
};
