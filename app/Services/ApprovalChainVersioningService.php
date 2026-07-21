<?php

namespace App\Services;

use App\Models\ApprovalChain;
use App\Models\ApprovalChainVersion;
use App\Models\ApprovalItem;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class ApprovalChainVersioningService
{
    public static function hasInFlightItems(ApprovalChainVersion $version): bool
    {
        return ApprovalItem::where('approval_chain_version_id', $version->id)
            ->whereNotIn('status', ['approved', 'rejected', 'cancelled'])
            ->exists();
    }

    public static function saveSteps(ApprovalChain $chain, array $stepsData, User $actor): ApprovalChainVersion
    {
        $current = $chain->versions()->where('is_current', true)->first();

        $target = (!$current || self::hasInFlightItems($current))
            ? self::cloneToNewVersion($chain, $current, $actor)
            : $current;

        // Sync approval_steps by id (keep/update existing, delete removed, create new)
        $keepStepIds = collect($stepsData)
            ->filter(fn ($s) => isset($s['id']))
            ->pluck('id')
            ->toArray();

        $target->steps()->whereNotIn('id', $keepStepIds)->delete();

        foreach ($stepsData as $index => $stepData) {
            if (isset($stepData['id'])) {
                $target->steps()->find($stepData['id'])?->update([
                    'step_number' => $index + 1,
                    'name' => $stepData['name'],
                    'approver_type' => $stepData['approver_type'],
                    'approver_config' => $stepData['approver_config'] ?? null,
                    'quorum_mode' => $stepData['quorum_mode'] ?? 'all',
                    'quorum_count' => $stepData['quorum_count'] ?? null,
                    'skip_conditions' => $stepData['skip_conditions'] ?? null,
                    'on_reject_override' => $stepData['on_reject_override'] ?? null,
                    'fallback_user_id' => $stepData['fallback_user_id'] ?? null,
                    'parallel_group' => $stepData['parallel_group'] ?? null,
                ]);
            } else {
                $target->steps()->create([
                    'step_number' => $index + 1,
                    'name' => $stepData['name'],
                    'approver_type' => $stepData['approver_type'],
                    'approver_config' => $stepData['approver_config'] ?? null,
                    'quorum_mode' => $stepData['quorum_mode'] ?? 'all',
                    'quorum_count' => $stepData['quorum_count'] ?? null,
                    'skip_conditions' => $stepData['skip_conditions'] ?? null,
                    'on_reject_override' => $stepData['on_reject_override'] ?? null,
                    'fallback_user_id' => $stepData['fallback_user_id'] ?? null,
                    'parallel_group' => $stepData['parallel_group'] ?? null,
                ]);
            }
        }

        return $target;
    }

    private static function cloneToNewVersion(ApprovalChain $chain, ?ApprovalChainVersion $from, User $actor): ApprovalChainVersion
    {
        return DB::transaction(function () use ($chain, $from, $actor) {
            if ($from) {
                $from->update(['is_current' => false]);
            }

            $new = $chain->versions()->create([
                'version_number' => ($from?->version_number ?? 0) + 1,
                'is_current' => true,
                'created_by' => $actor->id,
            ]);

            if ($from) {
                foreach ($from->steps as $step) {
                    $new->steps()->create($step->only([
                        'step_number',
                        'name',
                        'approver_type',
                        'approver_config',
                        'quorum_mode',
                        'quorum_count',
                        'skip_conditions',
                        'on_reject_override',
                        'fallback_user_id',
                        'parallel_group',
                    ]));
                }
            }

            return $new;
        });
    }
}
