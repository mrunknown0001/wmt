<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_chain_versions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('approval_chain_id');
            $table->integer('version_number');
            $table->boolean('is_current')->default(true);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->foreign('approval_chain_id', 'acv_chain_fk')->references('id')->on('approval_chains')->cascadeOnDelete();
            $table->foreign('created_by', 'acv_creator_fk')->references('id')->on('users')->nullOnDelete();
            $table->unique(['approval_chain_id', 'version_number'], 'acv_chain_version_unique');
            $table->index('is_current');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_chain_versions');
    }
};
