<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('approval_items', function (Blueprint $table) {
            // Archiving is independent of the workflow status, so an approved/rejected
            // request keeps its outcome when archived.
            $table->timestamp('archived_at')->nullable()->after('decided_at');
            $table->index('archived_at');
        });
    }

    public function down(): void
    {
        Schema::table('approval_items', function (Blueprint $table) {
            $table->dropIndex(['archived_at']);
            $table->dropColumn('archived_at');
        });
    }
};
