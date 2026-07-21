<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_projects', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('status')->default('active'); // active, on_hold, completed, archived
            $table->unsignedBigInteger('owner_id')->nullable();
            $table->dateTime('due_date')->nullable();
            $table->boolean('is_pinned')->default(false);
            $table->integer('position')->default(0);
            $table->softDeletes();
            $table->timestamps();

            $table->foreign('owner_id', 'ap_owner_fk')->references('id')->on('users')->nullOnDelete();
            $table->index('status');
            $table->index('owner_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_projects');
    }
};
