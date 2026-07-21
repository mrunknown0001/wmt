<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('approval_forms', function (Blueprint $table) {
            $table->enum('email_mode', ['any', 'registered'])->default('any')->after('banner_path');
        });
    }

    public function down(): void
    {
        Schema::table('approval_forms', function (Blueprint $table) {
            $table->dropColumn('email_mode');
        });
    }
};
