<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_step_instances', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('approval_item_id');
            $table->unsignedBigInteger('approval_step_id');
            $table->unsignedInteger('step_number');
            $table->unsignedInteger('attempt_number')->default(1);
            $table->string('status')->default('pending'); // pending, active, approved, rejected, skipped
            $table->unsignedInteger('quorum_required')->nullable();
            $table->dateTime('activated_at')->nullable();
            $table->dateTime('completed_at')->nullable();
            $table->timestamps();

            $table->foreign('approval_item_id', 'asi_item_fk')->references('id')->on('approval_items')->cascadeOnDelete();
            $table->foreign('approval_step_id', 'asi_step_fk')->references('id')->on('approval_steps')->restrictOnDelete();
            $table->index(['approval_item_id', 'step_number', 'attempt_number'], 'asi_item_step_attempt_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_step_instances');
    }
};
