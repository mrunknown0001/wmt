<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_item_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('approval_item_id')->constrained('approval_items')->cascadeOnDelete();
            $table->string('file_name');
            $table->string('file_path');
            $table->string('file_type');
            $table->integer('file_size')->default(0);
            $table->timestamps();

            $table->index(['approval_item_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_item_attachments');
    }
};
