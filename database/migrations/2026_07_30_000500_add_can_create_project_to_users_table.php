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
            // Sits alongside can_approve / can_create_rules / can_request: a
            // capability granted per person, on top of whatever their role
            // allows.
            $table->boolean('can_create_project')->default(false)->after('can_approve');
        });

        // Until now every signed-in user could start a project, so switching
        // the gate on would take that away from people mid-flight. Anyone who
        // already owns one demonstrably needs it and keeps it; everyone else
        // starts without, which is the point of adding the flag.
        //
        // Admins are not backfilled because they never consult this column —
        // canCreateProjects() lets manage-projects through regardless.
        DB::table('users')
            ->whereIn('id', DB::table('projects')->select('owner_id')->whereNotNull('owner_id'))
            ->update(['can_create_project' => true]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('can_create_project');
        });
    }
};
