<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('can_request')->default(false)->after('can_approve');
        });

        // Preserve current behavior: grant the capability to users who have already
        // submitted approval requests so their existing history stays reachable.
        $requesterIds = DB::table('approval_items')->whereNotNull('requested_by')->distinct()->pluck('requested_by');
        if ($requesterIds->isNotEmpty()) {
            DB::table('users')->whereIn('id', $requesterIds)->update(['can_request' => true]);
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('can_request');
        });
    }
};
