<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('project_automation_rules', function (Blueprint $table) {
            $table->json('trigger_config')->nullable()->after('trigger_type');
        });
    }

    public function down(): void
    {
        Schema::table('project_automation_rules', function (Blueprint $table) {
            $table->dropColumn('trigger_config');
        });
    }
};
