<?php

namespace App\Http\Controllers;

use App\Models\ApprovalProject;
use App\Models\ApprovalItem;
use App\Http\Requests\StoreApprovalItemRequest;
use App\Http\Requests\UpdateApprovalItemRequest;
use App\Services\ApprovalWorkflowEngine;
use Illuminate\Http\Request;
use Inertia\Inertia;

class ApprovalItemController extends Controller
{
    public function index(ApprovalProject $approvalProject)
    {
        $this->authorize('view', $approvalProject);

        $items = $approvalProject->approvalItems()
            ->with([
                'requester',
                'chainVersion.chain',
                'stepInstances' => function ($q) {
                    $q->where('status', 'active')->with('approvers');
                }
            ])
            ->orderBy('created_at', 'desc')
            ->paginate(15);

        return Inertia::render('ApprovalItems/Index', [
            'project' => $approvalProject,
            'items' => $items,
        ]);
    }

    public function create(ApprovalProject $approvalProject)
    {
        $this->authorize('view', $approvalProject);

        return Inertia::render('ApprovalItems/Create', [
            'project' => $approvalProject->load('customFields.options', 'sections'),
        ]);
    }

    public function store(StoreApprovalItemRequest $request, ApprovalProject $approvalProject)
    {
        $this->authorize('view', $approvalProject);

        $item = $approvalProject->approvalItems()->create([
            'title' => $request->title,
            'description' => $request->description,
            'requested_by' => auth()->id(),
            'status' => 'pending',
            'position' => $approvalProject->approvalItems()->max('position') + 1,
        ]);

        // Store custom field values
        if ($request->has('customFieldValues')) {
            foreach ($request->customFieldValues as $fieldId => $value) {
                $customField = $approvalProject->customFields()->find($fieldId);
                if ($customField && $customField->type !== 'formula') {
                    $cfv = $item->customFieldValues()->create([
                        'approval_custom_field_id' => $fieldId,
                    ]);
                    $cfv->setTypedValue($customField->type, $value);
                    $cfv->save();
                }
            }
        }

        // Start the approval workflow
        ApprovalWorkflowEngine::submit($item);

        return redirect()->route('approval-projects.items.show', [$approvalProject, $item])
            ->with('success', 'Approval request submitted successfully.');
    }

    public function show(ApprovalProject $approvalProject, ApprovalItem $item)
    {
        $this->authorize('view', $item);
        abort_if($item->approval_project_id !== $approvalProject->id, 404);

        $item->load([
            'requester',
            'customFieldValues.customField.options',
            'stepInstances.step.chainVersion.chain',
            'stepInstances.approvers.user',
            'stepInstances.decisions.decider',
            'chainVersion.steps',
            'comments.user',
            'comments.attachments',
        ]);

        // Append URL to each attachment for proper serialization
        if ($item->comments) {
            foreach ($item->comments as $comment) {
                if ($comment->attachments) {
                    foreach ($comment->attachments as $attachment) {
                        $attachment->append('url');
                    }
                }
            }
        }

        return Inertia::render('ApprovalItems/Show', [
            'project' => $approvalProject,
            'item' => $item,
            'canDecide' => auth()->user()->can('decide', $item),
            'canEdit' => auth()->user()->can('update', $item),
        ]);
    }

    public function edit(ApprovalProject $approvalProject, ApprovalItem $item)
    {
        $this->authorize('update', $item);
        abort_if($item->approval_project_id !== $approvalProject->id, 404);

        return Inertia::render('ApprovalItems/Edit', [
            'project' => $approvalProject->load('customFields.options', 'sections'),
            'item' => $item->load('customFieldValues.customField.options'),
        ]);
    }

    public function update(UpdateApprovalItemRequest $request, ApprovalProject $approvalProject, ApprovalItem $item)
    {
        $this->authorize('update', $item);
        abort_if($item->approval_project_id !== $approvalProject->id, 404);

        $item->update([
            'title' => $request->title,
            'description' => $request->description,
        ]);

        // Update custom field values
        if ($request->has('customFieldValues')) {
            foreach ($request->customFieldValues as $fieldId => $value) {
                $customField = $approvalProject->customFields()->find($fieldId);
                if ($customField && $customField->type !== 'formula') {
                    $cfv = $item->customFieldValues()
                        ->firstOrCreate(['approval_custom_field_id' => $fieldId]);
                    $cfv->setTypedValue($customField->type, $value);
                    $cfv->save();
                }
            }
        }

        return redirect()->route('approval-projects.items.show', [$approvalProject, $item])
            ->with('success', 'Approval request updated successfully.');
    }

    public function destroy(ApprovalProject $approvalProject, ApprovalItem $item)
    {
        $this->authorize('cancel', $item);
        abort_if($item->approval_project_id !== $approvalProject->id, 404);

        ApprovalWorkflowEngine::cancel($item, auth()->user());

        return redirect()->route('approval-projects.show', $approvalProject)
            ->with('success', 'Approval request cancelled.');
    }

    public function advance(Request $request, ApprovalProject $approvalProject, ApprovalItem $item)
    {
        $this->authorize('decide', $item);
        abort_if($item->approval_project_id !== $approvalProject->id, 404);

        $request->validate([
            'action' => 'required|in:approved,rejected',
            'comment' => 'nullable|string|max:5000',
        ]);

        ApprovalWorkflowEngine::advance($item, $request->action, auth()->user(), $request->comment);

        return redirect()->route('approval-projects.items.show', [$approvalProject, $item])
            ->with('success', "Approval request {$request->action}.");
    }

    public function resubmit(ApprovalProject $approvalProject, ApprovalItem $item)
    {
        $this->authorize('resubmit', $item);
        abort_if($item->approval_project_id !== $approvalProject->id, 404);

        ApprovalWorkflowEngine::resubmit($item, auth()->user());

        return redirect()->route('approval-projects.items.show', [$approvalProject, $item])
            ->with('success', 'Approval request resubmitted.');
    }
}
