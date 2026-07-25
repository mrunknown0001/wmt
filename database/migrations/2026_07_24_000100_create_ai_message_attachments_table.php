<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_message_attachments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('ai_message_id');
            $table->string('file_name');
            $table->string('file_path');
            $table->string('file_type')->nullable();
            $table->unsignedBigInteger('file_size')->default(0);
            $table->string('kind')->default('file'); // image | file | text
            // Text extracted from documents/spreadsheets, replayed to the model in
            // later turns so it "remembers" the file without re-uploading it.
            $table->longText('extracted_text')->nullable();
            $table->timestamps();

            $table->foreign('ai_message_id')->references('id')->on('ai_messages')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_message_attachments');
    }
};
