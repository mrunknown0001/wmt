<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('approval_project_id');
            $table->string('title');
            $table->text('description')->nullable();
            $table->unsignedBigInteger('requested_by')->nullable();
            $table->string('status')->default('pending'); // pending, changes_requested, approved, rejected, cancelled
            $table->unsignedInteger('current_step_number')->nullable();
            $table->dateTime('submitted_at')->nullable();
            $table->dateTime('decided_at')->nullable();
            $table->integer('position')->default(0);
            $table->softDeletes();
            $table->timestamps();

            $table->foreign('approval_project_id', 'ai_project_fk')->references('id')->on('approval_projects')->cascadeOnDelete();
            $table->foreign('requested_by', 'ai_requester_fk')->references('id')->on('users')->nullOnDelete();
            $table->index('status');
            $table->index('approval_project_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_items');
    }
};
