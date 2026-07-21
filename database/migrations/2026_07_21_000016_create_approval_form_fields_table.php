<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_form_fields', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('approval_form_id');
            $table->string('type'); // text, textarea, select, multi_select, date, number, email, heading, description, attachment, capture_photo, capture_video
            $table->string('label');
            $table->text('help_text')->nullable();
            $table->boolean('is_required')->default(false);
            $table->integer('position')->default(0);
            $table->json('config')->nullable(); // field-type-specific config, email_mode, options
            $table->string('maps_to')->nullable(); // description, custom_field, assignee
            $table->unsignedBigInteger('custom_field_id')->nullable(); // FK to approval_custom_fields
            $table->text('default_value')->nullable();
            $table->boolean('is_visible')->default(true);
            $table->json('conditions')->nullable(); // {logic: 'all'|'any', rules: [...]}
            $table->timestamps();

            $table->foreign('approval_form_id', 'aff_form_fk')->references('id')->on('approval_forms')->cascadeOnDelete();
            $table->foreign('custom_field_id', 'aff_field_fk')->references('id')->on('approval_custom_fields')->nullOnDelete();
            $table->index('position');
            $table->index('type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_form_fields');
    }
};
