<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Sub-sections: one level beneath a section, and no further.
 *
 * The depth limit is deliberate and enforced in the model rather than the
 * schema — a self-referencing column can nest forever, and a board that can
 * nest forever stops being a board. One level is enough to file a section's
 * work by period ("Requests" → "2026-08") without turning the task list into a
 * tree nobody can scan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('task_sections', function (Blueprint $table) {
            $table->foreignId('parent_id')->nullable()->after('project_id')
                ->constrained('task_sections')->cascadeOnDelete();

            // Sub-sections are always read as "the children of this section",
            // and automation looks one up by name on every routed submission.
            $table->index(['parent_id', 'position']);
            $table->index(['project_id', 'parent_id', 'name']);
        });
    }

    public function down(): void
    {
        Schema::table('task_sections', function (Blueprint $table) {
            $table->dropIndex(['project_id', 'parent_id', 'name']);
            $table->dropIndex(['parent_id', 'position']);
            $table->dropConstrainedForeignId('parent_id');
        });
    }
};
