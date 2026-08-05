<?php

namespace App\Services;

use App\Models\Task;
use App\Models\TaskSection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Works out which section a task should land in, creating period sub-sections
 * on demand.
 *
 * The case this exists for: a public form feeds a project, and the submissions
 * need filing by when they arrived rather than piling into one endless column.
 * A rule routes to "Requests", and this puts the task in "Requests › 2026-08",
 * making that sub-section the first time a submission arrives in August.
 *
 * Only the sub-section is ever created automatically. The parent has to be a
 * section somebody chose, so a misconfigured rule cannot quietly grow new
 * columns on a board.
 */
class SectionRouter
{
    /**
     * How a period sub-section is named.
     *
     * Sortable formats first: sections are ordered by position, but a person
     * scanning a board reads the names, and "2026-08" sorts the way it reads.
     */
    public const PERIOD_FORMATS = [
        'year_month' => ['label' => '2026-08', 'format' => 'Y-m'],
        'month_name' => ['label' => 'August 2026', 'format' => 'F Y'],
        'year' => ['label' => '2026', 'format' => 'Y'],
        'quarter' => ['label' => '2026-Q3', 'format' => null],
    ];

    /** Which date the period is taken from. */
    public const PERIOD_SOURCES = ['created', 'due'];

    /**
     * Resolve the section id an action should move a task to.
     *
     * Returns null to mean "no section", which is a legitimate outcome — a rule
     * can deliberately clear one.
     *
     * @param  array  $params  the action's stored params
     */
    public static function resolve(Task $task, array $params): ?int
    {
        $parentId = $params['section_id'] ?? null;

        if (!$parentId) {
            return null;
        }

        $parent = TaskSection::find($parentId);

        // A section deleted since the rule was written. Leaving the task where
        // it is beats filing it somewhere arbitrary.
        if (!$parent || (int) $parent->project_id !== (int) $task->project_id) {
            return null;
        }

        return match ($params['subsection_mode'] ?? 'none') {
            'fixed' => self::fixedChild($parent, $params['subsection_id'] ?? null),
            'period' => self::periodChild($task, $parent, $params),
            default => $parent->id,
        };
    }

    /** A sub-section chosen by hand, checked to still be a child of the parent. */
    private static function fixedChild(TaskSection $parent, $subsectionId): int
    {
        if (!$subsectionId) {
            return $parent->id;
        }

        $child = TaskSection::where('id', $subsectionId)
            ->where('parent_id', $parent->id)
            ->first();

        // Moved or deleted since the rule was written — the parent is the
        // honest fallback, and it is where the user pointed the rule anyway.
        return $child?->id ?? $parent->id;
    }

    /** The sub-section for this task's period, made if this is the first one. */
    private static function periodChild(Task $task, TaskSection $parent, array $params): int
    {
        $date = self::periodDate($task, $params['period_source'] ?? 'created');

        if (!$date) {
            return $parent->id;
        }

        $name = self::periodName($date, $params['period_format'] ?? 'year_month');

        // Locked because two form submissions in the same second would
        // otherwise each find nothing and each create the month, leaving a
        // board with two "2026-08" columns and the tasks split across them.
        return DB::transaction(function () use ($parent, $name) {
            TaskSection::whereKey($parent->id)->lockForUpdate()->first();

            $existing = TaskSection::where('parent_id', $parent->id)
                ->where('name', $name)
                ->first();

            if ($existing) {
                return $existing->id;
            }

            $position = TaskSection::where('parent_id', $parent->id)->max('position');

            return TaskSection::create([
                'project_id' => $parent->project_id,
                'parent_id' => $parent->id,
                'name' => $name,
                'position' => $position === null ? 0 : $position + 1,
            ])->id;
        });
    }

    private static function periodDate(Task $task, string $source): ?Carbon
    {
        if ($source === 'due') {
            // A task with no due date has no period to file it under; falling
            // back to today would put it in a month it has nothing to do with.
            return $task->due_date ? Carbon::parse($task->due_date) : null;
        }

        return $task->created_at ? Carbon::parse($task->created_at) : now();
    }

    /** The sub-section name for a date under the chosen format. */
    public static function periodName(Carbon $date, string $format): string
    {
        if ($format === 'quarter') {
            return $date->format('Y') . '-Q' . $date->quarter;
        }

        $spec = self::PERIOD_FORMATS[$format]['format']
            ?? self::PERIOD_FORMATS['year_month']['format'];

        return $date->format($spec);
    }
}
