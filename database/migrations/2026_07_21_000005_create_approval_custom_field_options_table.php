<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_custom_field_options', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('approval_custom_field_id');
            $table->string('label');
            $table->string('color')->nullable();
            $table->integer('position')->default(0);
            $table->timestamps();

            $table->foreign('approval_custom_field_id', 'acfo_field_fk')->references('id')->on('approval_custom_fields')->cascadeOnDelete();
            $table->index('position');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_custom_field_options');
    }
};
