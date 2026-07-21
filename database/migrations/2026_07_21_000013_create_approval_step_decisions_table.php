<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_step_decisions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('approval_step_instance_id');
            $table->unsignedBigInteger('decided_by')->nullable();
            $table->string('decision'); // approved, rejected
            $table->text('comment')->nullable();
            $table->dateTime('decided_at');
            $table->timestamps();

            $table->foreign('approval_step_instance_id', 'asd_instance_fk')->references('id')->on('approval_step_instances')->cascadeOnDelete();
            $table->foreign('decided_by', 'asd_decided_by_fk')->references('id')->on('users')->nullOnDelete();
            $table->unique(['approval_step_instance_id', 'decided_by'], 'asd_instance_decided_by_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_step_decisions');
    }
};
