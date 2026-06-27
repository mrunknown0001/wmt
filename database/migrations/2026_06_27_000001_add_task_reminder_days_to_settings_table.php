<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $table->json('task_reminder_days')->nullable();
            $table->boolean('task_reminders_enabled')->default(true);
        });

        DB::table('settings')->whereNull('task_reminder_days')->update([
            'task_reminder_days' => json_encode([7, 3, 1]),
        ]);
    }

    public function down(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $table->dropColumn(['task_reminder_days', 'task_reminders_enabled']);
        });
    }
};
