<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_automation_rules', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('approval_project_id');
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->string('trigger_type'); // item_submitted, approval_requested, approval_step_decided, approval_completed, approval_rejected, approval_changes_requested, approval_cancelled
            $table->json('trigger_config')->nullable(); // trigger-type-specific config
            $table->json('conditions')->nullable(); // {logic: 'all'|'any', rules: [...]}
            $table->json('actions'); // [{type, params}, ...]
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->foreign('approval_project_id', 'aar_project_fk')->references('id')->on('approval_projects')->cascadeOnDelete();
            $table->foreign('created_by', 'aar_creator_fk')->references('id')->on('users')->nullOnDelete();
            $table->index('trigger_type');
            $table->index('is_active');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_automation_rules');
    }
};
