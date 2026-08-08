<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\ApprovalProject;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskDelegationItem;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Moving a departed person's responsibilities to somebody else, for good.
 *
 * Distinct from task cover, which is temporary and hands everything back. This
 * is what you do when someone has left: their unfinished tasks become another
 * person's, permanently, and there is nothing to return.
 *
 * Finished and cancelled tasks are deliberately left where they are. Reassigning
 * them would rewrite who did the work, and every report in the app reads
 * completion history off assigned_to.
 */
class UserHandover
{
    /** Projects a departing person is answerable for, of both kinds. */
    public static function ownedProjects(User $user): int
    {
        return Project::where('owner_id', $user->id)->count()
            + ApprovalProject::where('owner_id', $user->id)->count();
    }

    /** Tasks a departing person still owes. */
    public static function pendingFor(User $user)
    {
        return Task::query()
            ->where('assigned_to', $user->id)
            ->whereNotIn('status', Task::CLOSING_STATUSES);
    }

    /**
     * Hand everything one person is answerable for to another.
     *
     * @return array{tasks: int, projects: int, approval_projects: int, cover_held: int, cover_owed: int}
     */
    public static function transfer(User $from, User $to, ?User $actor = null): array
    {
        return DB::transaction(function () use ($from, $to, $actor) {
            $taskIds = self::pendingFor($from)->pluck('id');

            // Updated in one statement rather than task by task: the model's
            // saved hook would otherwise try to route each one through any live
            // task cover, quietly undoing the transfer it is part of.
            $tasks = $taskIds->isEmpty()
                ? 0
                : Task::whereIn('id', $taskIds)->update(['assigned_to' => $to->id]);

            // Cover this person was providing. The ledger has to follow them,
            // or when the cover ends handBack() looks for a task still assigned
            // to the person who left, finds it moved, and silently declines to
            // return it — stranding it with the new owner for good.
            $coverHeld = TaskDelegationItem::whereNull('restored_at')
                ->where('delegate_id', $from->id)
                ->update(['delegate_id' => $to->id]);

            // Cover somebody was providing *for* this person. Those tasks are
            // due back to them, and they are gone, so the new owner inherits
            // the claim.
            $coverOwed = TaskDelegationItem::whereNull('restored_at')
                ->where('original_assignee_id', $from->id)
                ->update(['original_assignee_id' => $to->id]);

            // Ownership is a live responsibility, not a record of what
            // happened, so unlike a finished task there is nothing to preserve
            // by leaving it pointed at somebody who has gone — including on
            // archived projects, which still need an owner if they are reopened.
            $projects = Project::where('owner_id', $from->id)->update(['owner_id' => $to->id]);
            $approvalProjects = ApprovalProject::where('owner_id', $from->id)->update(['owner_id' => $to->id]);

            if ($actor) {
                self::log($from, $to, $actor, $tasks, $projects + $approvalProjects);
            }

            return [
                'tasks' => $tasks,
                'projects' => $projects,
                'approval_projects' => $approvalProjects,
                'cover_held' => $coverHeld,
                'cover_owed' => $coverOwed,
            ];
        });
    }

    /**
     * Written against the person who left, since that is the record someone
     * will go looking at when they wonder where the work went.
     */
    private static function log(User $from, User $to, User $actor, int $tasks, int $projects): void
    {
        $parts = [
            $tasks . ' unfinished ' . str('task')->plural($tasks),
        ];

        if ($projects > 0) {
            $parts[] = $projects . ' ' . str('project')->plural($projects);
        }

        ActivityLog::create([
            'user_id' => $actor->id,
            'entity_type' => 'user',
            'entity_id' => $from->id,
            'entity_name' => $from->name,
            'action' => 'updated',
            'description' => 'transferred ' . implode(' and ', $parts)
                . " from \"{$from->name}\" to \"{$to->name}\"",
        ]);
    }
}
