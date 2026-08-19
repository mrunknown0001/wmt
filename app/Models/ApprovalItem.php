<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class ApprovalItem extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'approval_project_id',
        'approval_section_id',
        'approval_chain_version_id',
        'title',
        'description',
        'requested_by',
        'status',
        'current_step_number',
        'submitted_at',
        'decided_at',
        'archived_at',
        'position',
    ];

    protected function casts(): array
    {
        return [
            'submitted_at' => 'datetime',
            'decided_at' => 'datetime',
            'archived_at' => 'datetime',
        ];
    }

    public function scopeArchived($query)
    {
        return $query->whereNotNull('archived_at');
    }

    public function scopeNotArchived($query)
    {
        return $query->whereNull('archived_at');
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }

    protected static function booted(): void
    {
        // Assign the project's series number.
        //
        // Done on the model rather than in the controllers because items are
        // created from three places — the app, the API and public approval forms
        // — and a number issued by only some of them would leave gaps.
        static::creating(function (ApprovalItem $item) {
            if ($item->series_number || !$item->approval_project_id) {
                return;
            }

            $claim = ApprovalProject::claimNextSeries((int) $item->approval_project_id);

            if ($claim !== null) {
                [$item->series_number, $item->series_sequence] = $claim;
            }
        });

        // When an approval item is soft-deleted, auto-cancel any open step
        // instances so the item never lingers in an approver's pending queue.
        // Force-deletes remove the rows outright, so there's nothing to cancel.
        static::deleting(function (ApprovalItem $item) {
            if ($item->isForceDeleting()) {
                return;
            }

            $item->stepInstances()
                ->whereIn('status', ['active', 'pending'])
                ->update(['status' => 'cancelled', 'completed_at' => now()]);
        });
    }

    public function approvalProject(): BelongsTo
    {
        return $this->belongsTo(ApprovalProject::class);
    }

    public function section(): BelongsTo
    {
        // Explicit FK — the column is approval_section_id, not the section_id
        // Eloquent would infer from the method name.
        return $this->belongsTo(ApprovalSection::class, 'approval_section_id');
    }

    public function chainVersion(): BelongsTo
    {
        return $this->belongsTo(ApprovalChainVersion::class, 'approval_chain_version_id');
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function customFieldValues(): HasMany
    {
        return $this->hasMany(ApprovalItemCustomFieldValue::class);
    }

    public function stepInstances(): HasMany
    {
        return $this->hasMany(ApprovalStepInstance::class)->orderBy('step_number');
    }

    public function comments(): HasMany
    {
        return $this->hasMany(ApprovalItemComment::class)->orderBy('created_at', 'desc');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(ApprovalItemAttachment::class);
    }

    /** Whether any approver has recorded a decision against this request yet. */
    public function hasAnyDecision(): bool
    {
        return $this->stepInstances()->whereHas('decisions')->exists();
    }

    /**
     * Whether this request's content — its title, description and custom field
     * values — is sealed against further editing.
     *
     * An approval is a signature against a specific version of a request. Once
     * an approver has signed, letting the content change underneath them would
     * leave their name on something they never saw, which is the one thing an
     * approval trail exists to prevent.
     *
     * Note the seal covers *content* only. Filing a request into a section,
     * archiving it, commenting on it and cancelling it all stay available, and
     * automation rules may still write custom fields — those fire on decision
     * and completion triggers by design, and are themselves recorded.
     */
    public function isContentFrozen(): bool
    {
        // Back with the requester for changes, or rejected outright. Revising
        // and resubmitting is the entire purpose of both states, so the earlier
        // decisions that produced them do not seal the request.
        if (in_array($this->status, ['changes_requested', 'rejected'], true)) {
            return false;
        }

        // Settled. Nothing about an approved or cancelled request should move
        // again, whether or not a decision was ever recorded (a chain whose
        // steps were all skipped can reach 'approved' with none).
        if (in_array($this->status, ['approved', 'cancelled'], true)) {
            return true;
        }

        // In flight: sealed from the moment the first approver signs.
        //
        // A resubmitted request is therefore sealed as soon as it goes back out,
        // since the decisions from its previous round still stand. That is
        // deliberate — it had its editing window while it sat with the
        // requester, and approvers looking at it again should not have it change
        // under them either.
        return $this->hasAnyDecision();
    }
}
