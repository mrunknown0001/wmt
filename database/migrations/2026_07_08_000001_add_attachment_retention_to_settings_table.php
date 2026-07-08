<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $table->boolean('attachment_retention_enabled')->default(false)->after('max_upload_size');
            $table->unsignedInteger('attachment_retention_days')->default(90)->after('attachment_retention_enabled');
        });
    }

    public function down(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $table->dropColumn(['attachment_retention_enabled', 'attachment_retention_days']);
        });
    }
};
