<?php

namespace App\Console\Commands;

use App\Services\MotionEffortGenerator;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Settle a day's effort for everybody whose clock was running.
 *
 * Closing a stretch of work settles the days it covered, which handles anybody
 * who pauses or finishes. This is for the ones who do neither: a task left in
 * motion for three weeks would otherwise contribute nothing to a report until
 * the day it ends, and then arrive as three weeks at once.
 *
 * Yesterday by default, because today is still moving — starting a second task
 * this afternoon changes what this morning was worth. Give it a date to settle
 * a particular day, which is also how a gap is filled after an outage.
 */
class MaterialiseMotionEffort extends Command
{
    protected $signature = 'motion:materialise
                            {--date= : The day to settle (defaults to yesterday)}
                            {--days=1 : How many days back from that one to cover}';

    protected $description = 'Work out effort from the task clocks for a day that has finished';

    public function handle(): int
    {
        $end = $this->option('date')
            ? Carbon::parse($this->option('date'))->startOfDay()
            : now()->subDay()->startOfDay();

        $days = max(1, (int) $this->option('days'));

        for ($i = 0; $i < $days; $i++) {
            $day = $end->copy()->subDays($i);
            $people = MotionEffortGenerator::forEveryoneOn($day);

            $this->info(sprintf(
                '%s: settled %d %s.',
                $day->toDateString(),
                $people,
                $people === 1 ? 'person' : 'people',
            ));
        }

        return self::SUCCESS;
    }
}
