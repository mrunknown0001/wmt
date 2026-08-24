<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            // A milestone is a zero-duration marker rather than a span of work:
            // start_date and due_date are held equal, and the Gantt draws a
            // diamond on that date instead of a bar.
            $table->boolean('is_milestone')->default(false)->after('priority');

            // The Gantt asks one question of a project — which of its tasks are
            // milestones — so the index leads with project_id.
            $table->index(['project_id', 'is_milestone']);
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropIndex(['project_id', 'is_milestone']);
            $table->dropColumn('is_milestone');
        });
    }
};
