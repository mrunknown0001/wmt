<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_sections', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('approval_project_id');
            $table->string('name');
            $table->string('color')->default('#6366f1');
            $table->integer('position')->default(0);
            $table->timestamps();

            $table->foreign('approval_project_id', 'as_project_fk')->references('id')->on('approval_projects')->cascadeOnDelete();
            $table->index('position');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_sections');
    }
};
