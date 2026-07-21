<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_steps', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('approval_chain_version_id');
            $table->unsignedInteger('step_number');
            $table->string('name');
            $table->string('approver_type'); // specific_user, role, requester_manager, department_head, division_head, team_leader, group, project_owner
            $table->json('approver_config')->nullable(); // shape depends on approver_type
            $table->string('quorum_mode')->default('all'); // any, all, majority, count
            $table->unsignedInteger('quorum_count')->nullable(); // used when quorum_mode = count
            $table->json('skip_conditions')->nullable(); // {logic: 'all'|'any', rules: [...]}
            $table->string('on_reject_override')->nullable(); // null = inherit chain's on_reject_behavior
            $table->unsignedBigInteger('fallback_user_id')->nullable();
            $table->unsignedInteger('parallel_group')->nullable(); // reserved for v2, unused in v1
            $table->timestamps();

            $table->foreign('approval_chain_version_id', 'as_version_fk')->references('id')->on('approval_chain_versions')->cascadeOnDelete();
            $table->foreign('fallback_user_id', 'as_fallback_fk')->references('id')->on('users')->nullOnDelete();
            $table->unique(['approval_chain_version_id', 'step_number'], 'as_version_step_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_steps');
    }
};
