<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('approval_items', function (Blueprint $table) {
            $table->unsignedBigInteger('approval_chain_version_id')->nullable()->after('approval_project_id');
            $table->foreign('approval_chain_version_id', 'ai_version_fk')->references('id')->on('approval_chain_versions')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('approval_items', function (Blueprint $table) {
            $table->dropForeign(['approval_chain_version_id']);
            $table->dropColumn('approval_chain_version_id');
        });
    }
};
