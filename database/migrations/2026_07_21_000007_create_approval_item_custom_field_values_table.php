<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_item_custom_field_values', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('approval_item_id');
            $table->unsignedBigInteger('approval_custom_field_id');
            $table->text('value_text')->nullable();
            $table->decimal('value_number', 15, 4)->nullable();
            $table->date('value_date')->nullable();
            $table->json('value_json')->nullable();
            $table->unsignedBigInteger('value_option_id')->nullable();
            $table->timestamps();

            $table->foreign('approval_item_id', 'aicfv_item_fk')->references('id')->on('approval_items')->cascadeOnDelete();
            $table->foreign('approval_custom_field_id', 'aicfv_field_fk')->references('id')->on('approval_custom_fields')->cascadeOnDelete();
            $table->foreign('value_option_id', 'aicfv_option_fk')->references('id')->on('approval_custom_field_options')->nullOnDelete();
            $table->unique(['approval_item_id', 'approval_custom_field_id'], 'aicfv_item_field_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_item_custom_field_values');
    }
};
