<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('tasks:send-reminders')->dailyAt('08:00');

// Scheduled automation rules pick their own hour, so this has to run every hour
// and match rules against the current one.
Schedule::command('automation:run-scheduled')->hourlyAt(5)->withoutOverlapping();

// Approval SLAs are set in hours, so a daily check would miss most of them.
Schedule::command('approvals:check-deadlines')->hourlyAt(10)->withoutOverlapping();

Schedule::command('backup:run --only-db')->dailyAt('02:00');
Schedule::command('backup:clean')->dailyAt('02:30');
Schedule::command('attachments:purge')->dailyAt('03:00');
Schedule::command('trash:purge')->dailyAt('03:30');
