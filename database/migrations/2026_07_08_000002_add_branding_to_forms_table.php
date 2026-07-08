<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('forms', function (Blueprint $table) {
            $table->string('logo_path')->nullable()->after('success_message');
            $table->string('logo_position', 20)->default('left')->after('logo_path');
            $table->string('banner_path')->nullable()->after('logo_position');
        });
    }

    public function down(): void
    {
        Schema::table('forms', function (Blueprint $table) {
            $table->dropColumn(['logo_path', 'logo_position', 'banner_path']);
        });
    }
};
