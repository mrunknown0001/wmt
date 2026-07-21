<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_step_instance_approvers', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('approval_step_instance_id');
            $table->unsignedBigInteger('user_id');
            $table->timestamps();

            $table->foreign('approval_step_instance_id', 'asia_instance_fk')->references('id')->on('approval_step_instances')->cascadeOnDelete();
            $table->foreign('user_id', 'asia_user_fk')->references('id')->on('users')->cascadeOnDelete();
            $table->unique(['approval_step_instance_id', 'user_id'], 'asia_instance_user_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_step_instance_approvers');
    }
};
