<?php

namespace App\Http\Controllers;

use App\Models\ApprovalProject;
use App\Models\ApprovalCustomField;
use App\Http\Requests\StoreApprovalCustomFieldRequest;
use App\Http\Requests\UpdateApprovalCustomFieldRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ApprovalCustomFieldController extends Controller
{
    private function authorizeProject(ApprovalProject $project): void
    {
        if (!auth()->user()->can('manage-approval-projects')
            && $project->owner_id !== auth()->id()
            && !$project->isProjectAdmin(auth()->user())) {
            abort(403);
        }
    }

    public function index(ApprovalProject $approvalProject): JsonResponse
    {
        return response()->json([
            'fields' => $approvalProject->customFields()
                ->with('options')
                ->get(),
        ]);
    }

    public function store(StoreApprovalCustomFieldRequest $request, ApprovalProject $approvalProject): JsonResponse
    {
        $this->authorizeProject($approvalProject);

        $position = $approvalProject->customFields()->max('position') + 1;

        $field = $approvalProject->customFields()->create([
            'name' => $request->name,
            'type' => $request->type,
            'is_required' => $request->is_required ?? false,
            'position' => $request->position ?? $position,
            'config' => $request->config ?? [],
        ]);

        if (in_array($request->type, ['single_select', 'multi_select']) && $request->has('options')) {
            foreach ($request->options as $index => $option) {
                $field->options()->create([
                    'label' => $option['label'],
                    'color' => $option['color'] ?? null,
                    'position' => $index,
                ]);
            }
        }

        return response()->json($field->load('options'), 201);
    }

    public function update(UpdateApprovalCustomFieldRequest $request, ApprovalProject $approvalProject, ApprovalCustomField $customField): JsonResponse
    {
        $this->authorizeProject($approvalProject);

        abort_if($customField->approval_project_id !== $approvalProject->id, 404);

        $customField->update([
            'name' => $request->name,
            'type' => $request->type,
            'is_required' => $request->is_required ?? false,
            'config' => $request->config ?? [],
        ]);

        if (in_array($request->type, ['single_select', 'multi_select'])) {
            $keepOptionIds = collect($request->options ?? [])
                ->filter(fn ($o) => isset($o['id']))
                ->pluck('id')
                ->toArray();

            $customField->options()->whereNotIn('id', $keepOptionIds)->delete();

            foreach ($request->options as $index => $option) {
                if (isset($option['id'])) {
                    $customField->options()->find($option['id'])?->update([
                        'label' => $option['label'],
                        'color' => $option['color'] ?? null,
                        'position' => $index,
                    ]);
                } else {
                    $customField->options()->create([
                        'label' => $option['label'],
                        'color' => $option['color'] ?? null,
                        'position' => $index,
                    ]);
                }
            }
        } else {
            $customField->options()->delete();
        }

        return response()->json($customField->load('options'));
    }

    public function destroy(ApprovalProject $approvalProject, ApprovalCustomField $customField): JsonResponse
    {
        $this->authorizeProject($approvalProject);

        abort_if($customField->approval_project_id !== $approvalProject->id, 404);

        $customField->delete();

        return response()->json(null, 204);
    }

    public function reorder(Request $request, ApprovalProject $approvalProject): JsonResponse
    {
        $this->authorizeProject($approvalProject);

        $order = $request->validate(['order' => 'required|array']);

        foreach ($order['order'] as $position => $fieldId) {
            $approvalProject->customFields()
                ->where('id', $fieldId)
                ->update(['position' => $position]);
        }

        return response()->json(['success' => true]);
    }
}
