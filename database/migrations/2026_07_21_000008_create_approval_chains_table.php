<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_chains', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('approval_project_id');
            $table->string('name');
            $table->text('description')->nullable();
            $table->boolean('is_default')->default(false);
            $table->boolean('is_active')->default(true);
            $table->integer('priority')->default(0);
            $table->json('selector_conditions')->nullable();
            $table->string('on_reject_behavior')->default('reject_item'); // reject_item, return_to_previous_step, return_to_requester
            $table->unsignedBigInteger('created_by')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->foreign('approval_project_id', 'ac_project_fk')->references('id')->on('approval_projects')->cascadeOnDelete();
            $table->foreign('created_by', 'ac_creator_fk')->references('id')->on('users')->nullOnDelete();
            $table->index('is_default');
            $table->index('is_active');
            $table->index('priority');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_chains');
    }
};
