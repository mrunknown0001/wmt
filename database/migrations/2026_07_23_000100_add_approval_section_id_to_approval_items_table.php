<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('approval_items', function (Blueprint $table) {
            // Requests can be grouped under a project section. Nullable: existing
            // requests (and any submitted without a default) stay ungrouped.
            $table->unsignedBigInteger('approval_section_id')->nullable()->after('approval_project_id');

            $table->foreign('approval_section_id', 'ai_section_fk')
                ->references('id')->on('approval_sections')
                ->nullOnDelete(); // deleting a section un-groups its requests
        });
    }

    public function down(): void
    {
        Schema::table('approval_items', function (Blueprint $table) {
            $table->dropForeign('ai_section_fk');
            $table->dropColumn('approval_section_id');
        });
    }
};
