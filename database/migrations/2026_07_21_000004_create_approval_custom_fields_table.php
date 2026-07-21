<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_custom_fields', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('approval_project_id');
            $table->string('name');
            $table->string('type'); // text, textarea, number, date, single_select, multi_select, formula
            $table->boolean('is_required')->default(false);
            $table->integer('position')->default(0);
            $table->json('config')->nullable(); // default_value, sort_mode, formula, result_type, decimal_places
            $table->timestamps();

            $table->foreign('approval_project_id', 'acf_project_fk')->references('id')->on('approval_projects')->cascadeOnDelete();
            $table->index('position');
            $table->index('type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_custom_fields');
    }
};
