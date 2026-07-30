<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            // On: the project follows the escalation tiers configured in admin
            // settings, which is what every project does today — hence the
            // default, so nothing changes until someone opts out.
            //
            // Off: the project escalates on its own rules and the global tiers
            // are skipped for its tasks entirely. Half-inheriting would make it
            // impossible to say why a notification fired.
            $table->boolean('use_global_escalation')->default(true);
        });

        Schema::create('project_escalation_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();

            // Shown in the notification, so it explains itself: "Shift lead",
            // "Plant manager", rather than "Level 3".
            $table->string('name', 80);

            // days  — whole days past the due date, as the global tiers work.
            // hours — hours past the due moment, which is the due time when one
            //         is set and the end of the due day when it isn't.
            $table->string('offset_unit', 10)->default('days');
            $table->unsignedSmallInteger('offset_value')->default(1);

            // Audience keys resolved against the assignee's org unit and the
            // project — 'assignee', 'team_leader', 'department_head',
            // 'division_head', 'project_owner', 'project_admins', 'executives'.
            $table->json('recipients');

            $table->boolean('is_active')->default(true);

            // Order is the escalation ladder: a task only ever moves up it, so
            // reaching rung three does not re-fire rungs one and two.
            $table->unsignedSmallInteger('position')->default(0);

            $table->timestamps();

            $table->index(['project_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_escalation_rules');

        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn('use_global_escalation');
        });
    }
};
