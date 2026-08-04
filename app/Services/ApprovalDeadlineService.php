<?php

namespace App\Services;

use App\Models\ApprovalProject;
use App\Models\ApprovalStep;
use App\Models\ApprovalStepInstance;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Deadlines on approval steps, and what happens when one passes.
 *
 * Nothing here ever decides an approval. An overdue step raises its visibility
 * — to the approvers, then to the people who own the process — and stops there.
 * Auto-approving on a timeout would turn an unanswered request into an
 * authorised one, which is the opposite of what an approval chain is for.
 */
class ApprovalDeadlineService
{
    /**
     * When a step activated now would be due.
     *
     * The step's own SLA wins; otherwise the project's default. Null from both
     * means the step has no deadline, which is how every project behaves until
     * someone sets one.
     */
    public static function dueAtFor(?ApprovalStep $step, ?ApprovalProject $project, ?Carbon $from = null): ?Carbon
    {
        $hours = $step?->sla_hours ?? $project?->default_sla_hours;

        if (!$hours || $hours < 1) {
            return null;
        }

        return ($from ?? now())->copy()->addHours((int) $hours);
    }

    /**
     * Steps that should be nudged: due soon, not yet reminded.
     *
     * @return Collection<int, ApprovalStepInstance>
     */
    public static function dueForReminder(?Carbon $now = null): Collection
    {
        $now ??= now();

        return self::liveInstances()
            ->whereNull('reminded_at')
            ->get()
            ->filter(function (ApprovalStepInstance $instance) use ($now) {
                $window = $instance->item?->approvalProject?->sla_reminder_hours;

                if (!$window || !$instance->due_at) {
                    return false;
                }

                // Inside the warning window, and not already past due — an
                // overdue step gets the overdue notice, not a "due soon" one.
                return $now->greaterThanOrEqualTo($instance->due_at->copy()->subHours((int) $window))
                    && $now->lessThan($instance->due_at);
            });
    }

    /**
     * Steps past their deadline by the project's grace period, not yet escalated.
     *
     * @return Collection<int, ApprovalStepInstance>
     */
    public static function dueForEscalation(?Carbon $now = null): Collection
    {
        $now ??= now();

        return self::liveInstances()
            ->whereNull('escalated_at')
            ->get()
            ->filter(function (ApprovalStepInstance $instance) use ($now) {
                $grace = $instance->item?->approvalProject?->sla_escalate_after_hours;

                if ($grace === null || !$instance->due_at) {
                    return false;
                }

                return $now->greaterThanOrEqualTo($instance->due_at->copy()->addHours((int) $grace));
            });
    }

    /**
     * Who to tell when a step has gone unanswered.
     *
     * The approvers again — they may simply have missed it — plus the people
     * who can do something structural about it: the project's owner and admins.
     *
     * @return array<int, User>
     */
    public static function escalationRecipients(ApprovalStepInstance $instance): array
    {
        $project = $instance->item?->approvalProject;

        $approvers = $instance->approvers()->with('user')->get()
            ->map(fn ($a) => $a->user)
            ->filter();

        $owners = collect();

        if ($project) {
            if ($project->owner_id) {
                $owners->push(User::find($project->owner_id));
            }

            $owners = $owners->merge(
                $project->members()->whereIn('role', ['admin', 'co-owner'])->get()
            );
        }

        return $approvers->merge($owners)
            ->filter()
            ->filter(fn (User $u) => (bool) $u->is_active)
            ->unique('id')
            ->values()
            ->all();
    }

    /** "3 hours overdue", "2 days overdue" — for the notification body. */
    public static function overdueLabel(ApprovalStepInstance $instance, ?Carbon $now = null): string
    {
        $now ??= now();

        if (!$instance->due_at) {
            return 'overdue';
        }

        $hours = (int) $instance->due_at->diffInHours($now);

        if ($hours < 24) {
            return max(1, $hours) . ' hour' . ($hours === 1 ? '' : 's') . ' overdue';
        }

        $days = intdiv($hours, 24);

        return $days . ' day' . ($days === 1 ? '' : 's') . ' overdue';
    }

    /** Active steps on live items, with everything the callers need. */
    private static function liveInstances()
    {
        return ApprovalStepInstance::query()
            ->where('status', 'active')
            ->whereNotNull('due_at')
            ->whereHas('item', fn ($q) => $q->whereNull('archived_at'))
            ->with(['item.approvalProject', 'item.requester', 'step']);
    }
}
