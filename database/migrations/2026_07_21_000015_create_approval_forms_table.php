<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_forms', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('approval_project_id');
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('uuid')->unique();
            $table->boolean('is_active')->default(true);
            $table->string('submit_button_text')->default('Submit');
            $table->text('success_message')->nullable();
            $table->json('item_defaults')->nullable(); // {status, section_id, title_field_ids}
            $table->unsignedBigInteger('created_by')->nullable();
            $table->string('logo_path')->nullable();
            $table->string('logo_position')->default('left'); // left, center, right
            $table->string('banner_path')->nullable();
            $table->timestamps();

            $table->foreign('approval_project_id', 'af_project_fk')->references('id')->on('approval_projects')->cascadeOnDelete();
            $table->foreign('created_by', 'af_creator_fk')->references('id')->on('users')->nullOnDelete();
            $table->index('is_active');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_forms');
    }
};
