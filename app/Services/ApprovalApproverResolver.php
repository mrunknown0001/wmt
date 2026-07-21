<?php

namespace App\Services;

use App\Models\ApprovalItem;
use App\Models\ApprovalStep;
use App\Models\User;
use Illuminate\Support\Collection;

class ApprovalApproverResolver
{
    public static function resolve(ApprovalStep $step, ApprovalItem $item): Collection
    {
        $users = match ($step->approver_type) {
            'specific_user' => self::resolveSpecificUser($step),
            'role' => self::resolveRole($step),
            'requester_manager' => self::resolveRequesterManager($item),
            'department_head' => self::resolveDepartmentHead($step, $item),
            'division_head' => self::resolveDivisionHead($step, $item),
            'team_leader' => self::resolveTeamLeader($step, $item),
            'group' => self::resolveGroup($step),
            'project_owner' => self::resolveProjectOwner($item),
            default => collect(),
        };

        if ($users->isEmpty() && $step->fallback_user_id) {
            $users = User::where('id', $step->fallback_user_id)->get();
        }

        if ($users->isEmpty() && $item->approvalProject->owner_id) {
            $users = User::where('id', $item->approvalProject->owner_id)->get();
        }

        return $users->unique('id')->values();
    }

    public static function requiredQuorum(ApprovalStep $step, int $resolvedCount): int
    {
        return match ($step->quorum_mode) {
            'any' => min(1, $resolvedCount),
            'all' => $resolvedCount,
            'majority' => $resolvedCount === 0 ? 0 : intdiv($resolvedCount, 2) + 1,
            'count' => min($step->quorum_count ?? $resolvedCount, $resolvedCount),
            default => $resolvedCount,
        };
    }

    private static function resolveSpecificUser(ApprovalStep $step): Collection
    {
        $userId = $step->approver_config['user_id'] ?? null;
        if (!$userId) {
            return collect();
        }
        return User::where('id', $userId)->where('is_active', true)->get();
    }

    private static function resolveRole(ApprovalStep $step): Collection
    {
        $role = $step->approver_config['role'] ?? null;
        if (!$role) {
            return collect();
        }
        return User::where('is_active', true)
            ->whereHas('roles', fn ($q) => $q->where('name', $role))
            ->get();
    }

    private static function resolveRequesterManager(ApprovalItem $item): Collection
    {
        $requester = $item->requester;
        if (!$requester) {
            return collect();
        }

        $manager = $requester->team?->leader
            ?? $requester->department?->head
            ?? $requester->department?->division?->head;

        return $manager ? collect([$manager]) : collect();
    }

    private static function resolveDepartmentHead(ApprovalStep $step, ApprovalItem $item): Collection
    {
        $config = $step->approver_config ?? [];
        $of = $config['of'] ?? 'requester';

        if ($of === 'requester') {
            $department = $item->requester?->department;
        } else {
            $departmentId = $config['department_id'] ?? null;
            $department = $departmentId ? \App\Models\Department::find($departmentId) : null;
        }

        if (!$department || !$department->head_id) {
            return collect();
        }

        return User::where('id', $department->head_id)->where('is_active', true)->get();
    }

    private static function resolveDivisionHead(ApprovalStep $step, ApprovalItem $item): Collection
    {
        $config = $step->approver_config ?? [];
        $of = $config['of'] ?? 'requester';

        if ($of === 'requester') {
            $division = $item->requester?->department?->division;
        } else {
            $divisionId = $config['division_id'] ?? null;
            $division = $divisionId ? \App\Models\Division::find($divisionId) : null;
        }

        if (!$division || !$division->head_id) {
            return collect();
        }

        return User::where('id', $division->head_id)->where('is_active', true)->get();
    }

    private static function resolveTeamLeader(ApprovalStep $step, ApprovalItem $item): Collection
    {
        $config = $step->approver_config ?? [];
        $of = $config['of'] ?? 'requester';

        if ($of === 'requester') {
            $team = $item->requester?->team;
        } else {
            $teamId = $config['team_id'] ?? null;
            $team = $teamId ? \App\Models\Team::find($teamId) : null;
        }

        if (!$team || !$team->leader_id) {
            return collect();
        }

        return User::where('id', $team->leader_id)->where('is_active', true)->get();
    }

    private static function resolveGroup(ApprovalStep $step): Collection
    {
        $userIds = $step->approver_config['user_ids'] ?? [];
        if (empty($userIds)) {
            return collect();
        }
        return User::whereIn('id', $userIds)->where('is_active', true)->get();
    }

    private static function resolveProjectOwner(ApprovalItem $item): Collection
    {
        if (!$item->approvalProject->owner_id) {
            return collect();
        }
        return User::where('id', $item->approvalProject->owner_id)->where('is_active', true)->get();
    }
}
