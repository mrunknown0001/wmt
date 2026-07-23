<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Custom, user-defined groups of people — for audiences that don't line up
        // with the org chart (e.g. "Night Shift", "Onboarding").
        Schema::create('link_groups', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('description')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('link_group_user', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('link_group_id');
            $table->unsignedBigInteger('user_id');
            $table->timestamps();

            $table->foreign('link_group_id')->references('id')->on('link_groups')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->unique(['link_group_id', 'user_id'], 'lgu_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('link_group_user');
        Schema::dropIfExists('link_groups');
    }
};
