<?php

namespace App\Console\Commands;

use App\Services\TaskDelegationService;
use Illuminate\Console\Command;

class ProcessTaskDelegations extends Command
{
    protected $signature = 'tasks:process-delegations';

    protected $description = 'Hand tasks to stand-ins whose cover starts today, and return tasks whose cover has ended';

    public function handle(): int
    {
        $summary = TaskDelegationService::processDue();

        $this->info(sprintf(
            '%d started (%d tasks out), %d ended (%d tasks back).',
            $summary['started'],
            $summary['tasks_out'],
            $summary['ended'],
            $summary['tasks_back'],
        ));

        return self::SUCCESS;
    }
}
