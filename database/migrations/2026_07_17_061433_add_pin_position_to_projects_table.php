<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->boolean('is_pinned')->default(false)->after('status');
            $table->unsignedInteger('position')->default(0)->after('is_pinned');
            $table->index(['folder_id', 'is_pinned', 'position']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropIndex(['folder_id', 'is_pinned', 'position']);
            $table->dropColumn(['is_pinned', 'position']);
        });
    }
};
