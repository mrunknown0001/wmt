<?php

namespace Database\Seeders;

use App\Models\Setting;
use Illuminate\Database\Seeder;

class SettingSeeder extends Seeder
{
    public function run(): void
    {
        Setting::firstOrCreate([], [
            'app_name' => 'WMT',
            'primary_color' => 'blue',
            'max_upload_size' => 10,
            'task_reminder_days' => [7, 3, 1],
            'task_reminders_enabled' => true,
            'escalation_enabled' => true,
            'escalation_tiers' => [
                ['days' => 1, 'enabled' => true],
                ['days' => 3, 'enabled' => true],
                ['days' => 7, 'enabled' => true],
                ['days' => 14, 'enabled' => true],
            ],
        ]);
    }
}
