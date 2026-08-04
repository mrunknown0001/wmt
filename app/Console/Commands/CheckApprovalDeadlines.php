<?php

namespace App\Console\Commands;

use App\Models\ApprovalDelegation;
use App\Models\ApprovalStepInstance;
use App\Notifications\ApprovalDeadlineNotification;
use App\Services\ApprovalDeadlineService;
use App\Services\ApprovalDelegationService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Notification;

class CheckApprovalDeadlines extends Command
{
    protected $signature = 'approvals:check-deadlines';
    protected $description = 'Remind approvers of steps falling due, and escalate ones that have passed';

    public function handle(): int
    {
        $reminded = $this->sendReminders();
        $escalated = $this->sendEscalations();
        $delegated = $this->applyStartingDelegations();

        $this->info("Reminded {$reminded}, escalated {$escalated}, applied {$delegated} delegation(s).");

        return self::SUCCESS;
    }

    private function sendReminders(): int
    {
        $count = 0;

        foreach (ApprovalDeadlineService::dueForReminder() as $instance) {
            $recipients = $instance->approvers()->with('user')->get()
                ->map(fn ($a) => $a->user)
                ->filter(fn ($u) => $u && $u->is_active)
                ->unique('id');

            if ($recipients->isNotEmpty()) {
                Notification::send($recipients, new ApprovalDeadlineNotification(
                    $instance->item,
                    $instance,
                    ApprovalDeadlineNotification::DUE_SOON,
                    'due ' . $instance->due_at->diffForHumans(),
                ));
            }

            // Stamped whether or not anyone was reachable, so a step with no
            // active approvers doesn't get retried on every run.
            $instance->update(['reminded_at' => now()]);
            $count++;
        }

        return $count;
    }

    private function sendEscalations(): int
    {
        $count = 0;

        foreach (ApprovalDeadlineService::dueForEscalation() as $instance) {
            $recipients = ApprovalDeadlineService::escalationRecipients($instance);

            if ($recipients !== []) {
                Notification::send($recipients, new ApprovalDeadlineNotification(
                    $instance->item,
                    $instance,
                    ApprovalDeadlineNotification::OVERDUE,
                    ApprovalDeadlineService::overdueLabel($instance),
                ));
            }

            $instance->update(['escalated_at' => now()]);
            $count++;
        }

        return $count;
    }

    /**
     * Pick up delegations whose start date has arrived.
     *
     * Setting one for next week has to reach the queue when the week comes, not
     * only when it was created — so each run re-applies today's live ones. The
     * service skips anyone already on the list, so this is safe to repeat.
     */
    private function applyStartingDelegations(): int
    {
        $delegations = ApprovalDelegation::query()->activeOn()->get();

        if ($delegations->isEmpty()) {
            return 0;
        }

        $userIds = $delegations->pluck('user_id')->unique();

        $instances = ApprovalStepInstance::query()
            ->where('status', 'active')
            ->whereHas('approvers', fn ($q) => $q
                ->whereIn('user_id', $userIds)
                ->whereNull('delegated_from_user_id'))
            ->get();

        $added = 0;

        foreach ($instances as $instance) {
            $added += ApprovalDelegationService::applyTo($instance);
        }

        return $added;
    }
}
