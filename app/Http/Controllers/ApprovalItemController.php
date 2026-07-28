<?php

namespace App\Http\Controllers;

use App\Models\ApprovalProject;
use App\Models\ApprovalItem;
use App\Models\User;
use App\Http\Requests\StoreApprovalItemRequest;
use App\Http\Requests\UpdateApprovalItemRequest;
use App\Services\ApprovalWorkflowEngine;
use Illuminate\Http\Request;
use Inertia\Inertia;

class ApprovalItemController extends Controller
{
    public function index(Request $request, ApprovalProject $approvalProject)
    {
        $this->authorize('view', $approvalProject);

        $query = $approvalProject->approvalItems()
            ->with([
                'requester',
                'section',
                'chainVersion.chain',
                'stepInstances' => function ($q) {
                    $q->where('status', 'active')->with('approvers');
                }
            ]);

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', '%' . $search . '%')
                    ->orWhere('description', 'like', '%' . $search . '%');
            });
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        if ($chainId = $request->input('chain_id')) {
            $query->whereHas('chainVersion', function ($q) use ($chainId) {
                $q->where('approval_chain_id', $chainId);
            });
        }

        if ($requesterId = $request->input('requester_id')) {
            $query->where('requested_by', $requesterId);
        }

        // 'none' narrows to ungrouped requests; any other value is a section id.
        if ($sectionId = $request->input('section_id')) {
            $sectionId === 'none'
                ? $query->whereNull('approval_section_id')
                : $query->where('approval_section_id', $sectionId);
        }

        // Archived requests are hidden unless explicitly requested (?archived=1).
        $showArchived = $request->boolean('archived');
        $showArchived
            ? $query->whereNotNull('archived_at')
            : $query->whereNull('archived_at');

        // Sorting — whitelist of sortable columns to keep this injection-safe.
        $sortable = ['title', 'requester', 'status', 'chain', 'created_at', 'submitted_at', 'series'];

        // Queue order by default: the request waiting longest sits at the top.
        $sort = in_array($request->input('sort'), $sortable, true)
            ? $request->input('sort')
            : 'submitted_at';

        $direction = strtolower($request->input('direction')) === 'asc' ? 'asc' : 'desc';

        // Default a fresh sort to a sensible direction when none is supplied.
        // Oldest-first for the queue columns; newest-first for created_at.
        if (!$request->filled('direction')) {
            $direction = $sort === 'created_at' ? 'desc' : 'asc';
        }

        $query->reorder(); // clear the relation's default orderBy('position')

        // Group by section: order by section first so each section's rows stay
        // contiguous (ungrouped last), then apply the chosen sort within a group.
        $groupBySection = $approvalProject->sections()->exists();
        if ($groupBySection) {
            $query->orderByRaw('approval_items.approval_section_id IS NULL')
                ->orderBy('approval_items.approval_section_id');
        }

        match ($sort) {
            'requester' => $query
                ->leftJoin('users', 'users.id', '=', 'approval_items.requested_by')
                ->select('approval_items.*')
                ->orderBy('users.name', $direction),
            'chain' => $query
                ->leftJoin('approval_chain_versions', 'approval_chain_versions.id', '=', 'approval_items.approval_chain_version_id')
                ->leftJoin('approval_chains', 'approval_chains.id', '=', 'approval_chain_versions.approval_chain_id')
                ->select('approval_items.*')
                ->orderBy('approval_chains.name', $direction),
            // Sorted on the numeric sequence, not the formatted string: if the
            // padding is ever widened, "SP-9" and "SP-00010" would sort wrongly as
            // text but correctly as numbers.
            'series' => $query
                ->orderByRaw('approval_items.series_sequence IS NULL')
                ->orderBy('approval_items.series_sequence', $direction),
            // Never-submitted drafts have no submitted_at; keep them after the
            // real queue rather than letting NULLs float to the top.
            'submitted_at' => $query
                ->orderByRaw('approval_items.submitted_at IS NULL')
                ->orderBy('approval_items.submitted_at', $direction)
                ->orderBy('approval_items.series_sequence', $direction),
            default => $query->orderBy('approval_items.' . $sort, $direction),
        };

        $items = $query->paginate(15)->withQueryString();

        $requesterIds = $approvalProject->approvalItems()
            ->reorder() // clear the relation's default orderBy('position') — invalid with DISTINCT
            ->distinct()
            ->pluck('requested_by')
            ->filter();

        $requesters = User::whereIn('id', $requesterIds)
            ->orderBy('name')
            ->get(['id', 'name']);

        return Inertia::render('ApprovalItems/Index', [
            'project' => $approvalProject,
            'items' => $items,
            'chains' => $approvalProject->chains()->get(['id', 'name']),
            'sections' => $approvalProject->sections()->get(['id', 'name', 'color']),
            'requesters' => $requesters,
            'filters' => [
                'search' => $request->input('search', ''),
                'status' => $request->input('status', ''),
                'chain_id' => $request->input('chain_id', ''),
                'requester_id' => $request->input('requester_id', ''),
                'section_id' => $request->input('section_id', ''),
                'sort' => $sort,
                'direction' => $direction,
                'archived' => $showArchived,
            ],
            'archivedCount' => $approvalProject->approvalItems()->whereNotNull('archived_at')->count(),
            'groupBySection' => $groupBySection,
        ]);
    }

    /**
     * Users granted the "Can Request" capability may raise a request against an
     * *active* approval project (mirrors the public request form, so requestors
     * aren't required to be project members). Everyone else falls back to the
     * normal project visibility rules (owners/members/admins).
     */
    private function authorizeRequestCreation(ApprovalProject $approvalProject): void
    {
        if (auth()->user()->can_request && $approvalProject->status === 'active') {
            return;
        }

        $this->authorize('view', $approvalProject);
    }

    public function create(ApprovalProject $approvalProject)
    {
        $this->authorizeRequestCreation($approvalProject);

        return Inertia::render('ApprovalItems/Create', [
            'project' => $approvalProject->load('customFields.options', 'sections'),
        ]);
    }

    public function store(StoreApprovalItemRequest $request, ApprovalProject $approvalProject)
    {
        $this->authorizeRequestCreation($approvalProject);

        // Validate the chosen section belongs to this project (ignore otherwise).
        $sectionId = $request->input('approval_section_id');
        if ($sectionId && !$approvalProject->sections()->whereKey($sectionId)->exists()) {
            $sectionId = null;
        }

        $item = $approvalProject->approvalItems()->create([
            'title' => $request->title,
            'description' => $request->description,
            'approval_section_id' => $sectionId,
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

        // Store any uploaded attachments before the workflow runs, so automation
        // and approvers see them on the request from the start.
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
            'attachments',
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

        // Append URL to item attachments
        if ($item->attachments) {
            foreach ($item->attachments as $attachment) {
                $attachment->append('url');
            }
        }

        return Inertia::render('ApprovalItems/Show', [
            // Field definitions come from the project so every custom field is shown
            // on the request, including ones added after it was submitted (which
            // have no stored value yet).
            'project' => $approvalProject->load('customFields.options', 'sections'),
            'item' => $item,
            'canDecide' => auth()->user()->can('decide', $item),
            'canEdit' => auth()->user()->can('update', $item),
            // Requester-only, and only while the request is awaiting their changes.
            'canResubmit' => auth()->user()->can('resubmit', $item),
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

    /** Move a request into a section (or ungroup it with a null value). */
    public function setSection(Request $request, ApprovalProject $approvalProject, ApprovalItem $item)
    {
        $this->authorize('update', $item);
        abort_if($item->approval_project_id !== $approvalProject->id, 404);

        $sectionId = $request->input('approval_section_id') ?: null;
        if ($sectionId && !$approvalProject->sections()->whereKey($sectionId)->exists()) {
            abort(422, 'Invalid section.');
        }

        $item->update(['approval_section_id' => $sectionId]);

        return back()->with('success', 'Request section updated.');
    }

    /** Toggle a request between archived and active. */
    public function archive(Request $request, ApprovalProject $approvalProject, ApprovalItem $item)
    {
        $this->authorize('update', $item);
        abort_if($item->approval_project_id !== $approvalProject->id, 404);

        $archiving = !$item->isArchived();
        $item->update(['archived_at' => $archiving ? now() : null]);

        return back()->with('success', 'Request ' . ($archiving ? 'archived' : 'unarchived') . ' successfully.');
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

        // Return the approver to the filtered/sorted list they came from, when provided.
        // (Only a leading "?" query string is accepted — the base path is fixed, so
        // this can't be turned into an open redirect.)
        $back = $request->input('back');
        if (is_string($back) && str_starts_with($back, '?')) {
            return redirect(route('approval-projects.items.index', $approvalProject) . $back)
                ->with('success', "Approval request {$request->action}.");
        }

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
