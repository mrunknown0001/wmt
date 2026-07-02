<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_custom_field_values', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('custom_field_id')->constrained()->cascadeOnDelete();
            $table->text('value_text')->nullable();
            $table->decimal('value_number', 15, 4)->nullable();
            $table->date('value_date')->nullable();
            $table->json('value_json')->nullable();
            $table->foreignId('value_option_id')->nullable()
                  ->constrained('custom_field_options')->nullOnDelete();
            $table->timestamps();

            $table->unique(['task_id', 'custom_field_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('task_custom_field_values');
    }
};
