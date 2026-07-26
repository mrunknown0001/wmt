<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreApprovalItemRequest;
use App\Http\Requests\UpdateApprovalItemRequest;
use App\Models\ApprovalItem;
use App\Models\ApprovalProject;
use App\Services\ApprovalWorkflowEngine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Mobile API for approval requests (items): list, view, create, decide,
 * resubmit, cancel, archive and section assignment. Mirrors the web
 * ApprovalItemController and reuses the same policies, form requests and
 * workflow engine so behavior is identical.
 */
class ApprovalItemController extends Controller
{
    public function index(Request $request, ApprovalProject $approvalProject): JsonResponse
    {
        $this->authorize('view', $approvalProject);

        $query = $approvalProject->approvalItems()
            ->with([
                'requester:id,name',
                'section:id,name,color',
                'chainVersion.chain:id,name',
                'stepInstances' => fn ($q) => $q->where('status', 'active')->with('approvers'),
            ]);

        if ($search = $request->input('search')) {
            $query->where(fn ($q) => $q
                ->where('title', 'like', "%{$search}%")
                ->orWhere('description', 'like', "%{$search}%"));
        }
        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }
        if ($sectionId = $request->input('section_id')) {
            $sectionId === 'none'
                ? $query->whereNull('approval_section_id')
                : $query->where('approval_section_id', $sectionId);
        }

        $request->boolean('archived')
            ? $query->whereNotNull('archived_at')
            : $query->whereNull('archived_at');

        return response()->json(
            $query->reorder()->orderByDesc('created_at')->paginate(20)
        );
    }

    public function store(StoreApprovalItemRequest $request, ApprovalProject $approvalProject): JsonResponse
    {
        // Same rule as web: requestors may submit against active projects; others
        // need project visibility.
        if (!($request->user()->can_request && $approvalProject->status === 'active')) {
            $this->authorize('view', $approvalProject);
        }

        $sectionId = $request->input('approval_section_id');
        if ($sectionId && !$approvalProject->sections()->whereKey($sectionId)->exists()) {
            $sectionId = null;
        }

        $item = $approvalProject->approvalItems()->create([
            'title' => $request->title,
            'description' => $request->description,
            'approval_section_id' => $sectionId,
            'requested_by' => $request->user()->id,
            'status' => 'pending',
            'position' => $approvalProject->approvalItems()->max('position') + 1,
        ]);

        if ($request->has('customFieldValues')) {
            foreach ($request->customFieldValues as $fieldId => $value) {
                $customField = $approvalProject->customFields()->find($fieldId);
                if ($customField && $customField->type !== 'formula') {
                    $cfv = $item->customFieldValues()->create(['approval_custom_field_id' => $fieldId]);
                    $cfv->setTypedValue($customField->type, $value);
                    $cfv->save();
                }
            }
        }

        if ($request->hasFile('attachments')) {
            foreach ($request->file('attachments') as $file) {
                if (!$file || !$file->isValid()) {
                    continue;
                }
                $path = $file->store("approval-items/{$item->id}", 'public');
                $item->attachments()->create([
                    'file_name' => $file->getClientOriginalName(),
                    'file_path' => $path,
                    'file_type' => $file->getClientMimeType(),
                    'file_size' => $file->getSize(),
                ]);
            }
        }

        ApprovalWorkflowEngine::submit($item);

        return response()->json(['item' => $this->itemPayload($item)], 201);
    }

    public function show(Request $request, ApprovalProject $approvalProject, ApprovalItem $item): JsonResponse
    {
        $this->authorize('view', $item);
        abort_if($item->approval_project_id !== $approvalProject->id, 404);

        return response()->json([
            'item' => $this->itemPayload($item),
            'canDecide' => $request->user()->can('decide', $item),
            'canEdit' => $request->user()->can('update', $item),
            'sections' => $approvalProject->sections()->get(['id', 'name', 'color']),
        ]);
    }

    public function update(UpdateApprovalItemRequest $request, ApprovalProject $approvalProject, ApprovalItem $item): JsonResponse
    {
        $this->authorize('update', $item);
        abort_if($item->approval_project_id !== $approvalProject->id, 404);

        $item->update($request->only(['title', 'description']));

        if ($request->has('customFieldValues')) {
            foreach ($request->customFieldValues as $fieldId => $value) {
                $customField = $approvalProject->customFields()->find($fieldId);
                if ($customField && $customField->type !== 'formula') {
                    $cfv = $item->customFieldValues()->firstOrCreate(['approval_custom_field_id' => $fieldId]);
                    $cfv->setTypedValue($customField->type, $value);
                    $cfv->save();
                }
            }
        }

        return response()->json(['item' => $this->itemPayload($item->fresh())]);
    }

    /** Approve or reject the active step (the mobile decision action). */
    public function advance(Request $request, ApprovalProject $approvalProject, ApprovalItem $item): JsonResponse
    {
        $this->authorize('decide', $item);
        abort_if($item->approval_project_id !== $approvalProject->id, 404);

        $validated = $request->validate([
            'action' => 'required|in:approved,rejected',
            'comment' => 'nullable|string|max:5000',
        ]);

        ApprovalWorkflowEngine::advance($item, $validated['action'], $request->user(), $validated['comment'] ?? null);

        return response()->json([
            'item' => $this->itemPayload($item->fresh()),
            'message' => "Approval request {$validated['action']}.",
        ]);
    }

    public function resubmit(Request $request, ApprovalProject $approvalProject, ApprovalItem $item): JsonResponse
    {
        $this->authorize('resubmit', $item);
        abort_if($item->approval_project_id !== $approvalProject->id, 404);

        ApprovalWorkflowEngine::resubmit($item, $request->user());

        return response()->json(['item' => $this->itemPayload($item->fresh())]);
    }

    /** Cancel the request (soft delete + workflow cancel), mirroring web destroy. */
    public function destroy(Request $request, ApprovalProject $approvalProject, ApprovalItem $item): JsonResponse
    {
        $this->authorize('cancel', $item);
        abort_if($item->approval_project_id !== $approvalProject->id, 404);

        ApprovalWorkflowEngine::cancel($item, $request->user());

        return response()->json(['success' => true]);
    }

    public function archive(Request $request, ApprovalProject $approvalProject, ApprovalItem $item): JsonResponse
    {
        $this->authorize('update', $item);
        abort_if($item->approval_project_id !== $approvalProject->id, 404);

        $item->update(['archived_at' => $item->isArchived() ? null : now()]);

        return response()->json(['item' => $item->fresh()]);
    }

    public function setSection(Request $request, ApprovalProject $approvalProject, ApprovalItem $item): JsonResponse
    {
        $this->authorize('update', $item);
        abort_if($item->approval_project_id !== $approvalProject->id, 404);

        $sectionId = $request->input('approval_section_id') ?: null;
        if ($sectionId && !$approvalProject->sections()->whereKey($sectionId)->exists()) {
            return response()->json(['message' => 'Invalid section.'], 422);
        }

        $item->update(['approval_section_id' => $sectionId]);

        return response()->json(['item' => $item->fresh()->load('section:id,name,color')]);
    }

    /** Full item detail matching the web show page, with attachment URLs. */
    private function itemPayload(ApprovalItem $item): ApprovalItem
    {
        $item->load([
            'requester:id,name',
            'section:id,name,color',
            'customFieldValues.customField.options',
            'stepInstances.step.chainVersion.chain',
            'stepInstances.approvers.user:id,name',
            'stepInstances.decisions.decider:id,name',
            'chainVersion.steps',
            'comments.user:id,name',
            'comments.attachments',
            'attachments',
        ]);

        foreach ($item->attachments as $attachment) {
            $attachment->append('url');
        }
        foreach ($item->comments as $comment) {
            foreach ($comment->attachments as $attachment) {
                $attachment->append('url');
            }
        }

        return $item;
    }
}
