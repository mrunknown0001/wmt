<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('tasks:send-reminders')->dailyAt('08:00');

// Cover starts and ends on whole days, so this runs just after midnight —
// early enough that a stand-in finds the work waiting at the start of the day,
// and that the owner has it back on the morning they return. Before the 08:00
// reminders, so nobody is chased about a task that is about to change hands.
Schedule::command('tasks:process-delegations')->dailyAt('00:10')->withoutOverlapping();

// Scheduled automation rules pick an hour and a minute, so this has to run every
// minute and match rules against the current one. A run that matches nothing
// costs one query, so the sweep only happens on the minute a rule asked for.
// withoutOverlapping so a long sweep cannot be started twice.
Schedule::command('automation:run-scheduled')->everyMinute()->withoutOverlapping();

// Approval SLAs are set in hours, so a daily check would miss most of them.
Schedule::command('approvals:check-deadlines')->hourlyAt(10)->withoutOverlapping();

Schedule::command('backup:run --only-db')->dailyAt('02:00');
Schedule::command('backup:clean')->dailyAt('02:30');

// A dead Google Drive token fails silently — backup:run still succeeds, having
// written a local copy only. This is the thing that notices. Monday morning, so
// there is a working week in which to fix it.
Schedule::command('backup:check-token')->weeklyOn(1, '08:00')->withoutOverlapping();
Schedule::command('attachments:purge')->dailyAt('03:00');
Schedule::command('trash:purge')->dailyAt('03:30');
