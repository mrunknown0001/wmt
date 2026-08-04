<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('approval_projects', function (Blueprint $table) {
            // How long a step has by default, in hours. Null means no deadline,
            // which is what every project does today.
            $table->unsignedSmallInteger('default_sla_hours')->nullable();

            // Hours before the deadline to nudge the approvers, and hours past
            // it before the project owner is told. Null switches each off.
            $table->unsignedSmallInteger('sla_reminder_hours')->nullable();
            $table->unsignedSmallInteger('sla_escalate_after_hours')->nullable();
        });

        Schema::table('approval_steps', function (Blueprint $table) {
            // Per-step override. Null falls back to the project's default, so a
            // chain only names the steps that are unusual.
            $table->unsignedSmallInteger('sla_hours')->nullable();
        });

        Schema::table('approval_step_instances', function (Blueprint $table) {
            // Stamped when the step goes live, from whichever SLA applied then.
            // Held on the instance rather than recomputed, so changing a chain
            // cannot silently move the deadline of work already in flight.
            $table->timestamp('due_at')->nullable()->after('activated_at');

            // Set once each, so a reminder and an escalation go out one time
            // rather than on every run of the scheduler.
            $table->timestamp('reminded_at')->nullable();
            $table->timestamp('escalated_at')->nullable();

            $table->index(['status', 'due_at']);
        });

        Schema::create('approval_delegations', function (Blueprint $table) {
            $table->id();

            // Who is away, and who is covering for them.
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('delegate_id')->constrained('users')->cascadeOnDelete();

            $table->date('starts_on');

            // Null is open-ended: someone on indefinite leave, ended by hand.
            $table->date('ends_on')->nullable();

            $table->string('reason', 255)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['user_id', 'starts_on', 'ends_on']);
        });

        Schema::table('approval_step_instance_approvers', function (Blueprint $table) {
            // Set when this row exists because someone delegated to them, so
            // the item's history can say why a stand-in could act.
            $table->foreignId('delegated_from_user_id')->nullable()
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('approval_step_instance_approvers', function (Blueprint $table) {
            $table->dropConstrainedForeignId('delegated_from_user_id');
        });

        Schema::dropIfExists('approval_delegations');

        Schema::table('approval_step_instances', function (Blueprint $table) {
            $table->dropIndex(['status', 'due_at']);
            $table->dropColumn(['due_at', 'reminded_at', 'escalated_at']);
        });

        Schema::table('approval_steps', function (Blueprint $table) {
            $table->dropColumn('sla_hours');
        });

        Schema::table('approval_projects', function (Blueprint $table) {
            $table->dropColumn(['default_sla_hours', 'sla_reminder_hours', 'sla_escalate_after_hours']);
        });
    }
};
