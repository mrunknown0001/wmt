<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            // Collapse closed tasks out of the list view. Off by default so
            // existing projects keep showing everything they show today.
            // No after() clause: it would name another column and fail on any
            // environment where that column isn't present yet. Position in the
            // table is cosmetic.
            $table->boolean('hide_completed_tasks')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn('hide_completed_tasks');
        });
    }
};
