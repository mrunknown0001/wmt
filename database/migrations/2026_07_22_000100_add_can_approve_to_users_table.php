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
            $table->boolean('can_approve')->default(false)->after('can_create_rules');
        });

        // Preserve current behavior: grant the capability to users who are already
        // assigned as approvers so existing approval workflows keep working.
        $approverIds = DB::table('approval_step_instance_approvers')->distinct()->pluck('user_id');
        if ($approverIds->isNotEmpty()) {
            DB::table('users')->whereIn('id', $approverIds)->update(['can_approve' => true]);
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('can_approve');
        });
    }
};
