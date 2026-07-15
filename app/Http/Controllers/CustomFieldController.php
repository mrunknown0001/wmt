<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreCustomFieldRequest;
use App\Http\Requests\UpdateCustomFieldRequest;
use App\Models\CustomField;
use App\Models\CustomFieldOption;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomFieldController extends Controller
{
    private function authorizeProject(Project $project): void
    {
        $user = auth()->user();
        if (!$user->can('manage-projects') && $project->owner_id !== $user->id && !$project->isProjectAdmin($user)) {
            abort(403);
        }
    }

    public function index(Project $project): JsonResponse
    {
        $fields = $project->customFields()->with('options')->get();

        return response()->json(['fields' => $fields]);
    }

    public function store(StoreCustomFieldRequest $request, Project $project): JsonResponse
    {
        $this->authorizeProject($project);

        $validated = $request->validated();
        $options = $validated['options'] ?? [];
        $defaultOptionIndexes = $validated['default_option_indexes'] ?? null;
        unset($validated['options'], $validated['default_option_indexes']);

        $validated['position'] = $validated['position']
            ?? ($project->customFields()->max('position') + 1);

        // Formula fields cannot be required (they are computed)
        if (($validated['type'] ?? '') === 'formula') {
            $validated['is_required'] = false;
        }

        $field = $project->customFields()->create($validated);

        if (in_array($field->type, ['single_select', 'multi_select'])) {
            foreach ($options as $i => $option) {
                $field->options()->create([
                    'label' => $option['label'],
                    'color' => $option['color'] ?? null,
                    'position' => $i,
                ]);
            }
        }

        $this->applySelectDefault($field, $defaultOptionIndexes);

        $field->load('options');

        return response()->json(['field' => $field], 201);
    }

    public function update(UpdateCustomFieldRequest $request, Project $project, CustomField $customField): JsonResponse
    {
        $this->authorizeProject($project);
        abort_if($customField->project_id !== $project->id, 404);

        $validated = $request->validated();
        $options = $validated['options'] ?? [];
        $defaultOptionIndexes = $validated['default_option_indexes'] ?? null;
        unset($validated['options'], $validated['default_option_indexes']);

        $customField->update($validated);

        if (in_array($customField->type, ['single_select', 'multi_select'])) {
            $keepIds = collect($options)->pluck('id')->filter()->toArray();
            $customField->options()->whereNotIn('id', $keepIds)->delete();

            foreach ($options as $i => $option) {
                if (!empty($option['id'])) {
                    $customField->options()->where('id', $option['id'])->update([
                        'label' => $option['label'],
                        'color' => $option['color'] ?? null,
                        'position' => $i,
                    ]);
                } else {
                    $customField->options()->create([
                        'label' => $option['label'],
                        'color' => $option['color'] ?? null,
                        'position' => $i,
                    ]);
                }
            }
        } else {
            $customField->options()->delete();
        }

        $this->applySelectDefault($customField, $defaultOptionIndexes);

        $customField->load('options');

        return response()->json(['field' => $customField]);
    }

    /**
     * Resolve select default option indexes (position in the submitted options
     * array) to persisted option IDs and store them in config.default_value.
     */
    private function applySelectDefault(CustomField $field, ?array $indexes): void
    {
        if (!in_array($field->type, ['single_select', 'multi_select'])) {
            return;
        }

        $config = $field->config ?? [];
        unset($config['default_value']);

        if (!empty($indexes)) {
            $options = $field->options()->orderBy('position')->get()->values();
            $ids = collect($indexes)
                ->map(fn ($i) => $options[$i]->id ?? null)
                ->filter()
                ->unique()
                ->values();

            if ($ids->isNotEmpty()) {
                $config['default_value'] = $field->type === 'single_select'
                    ? $ids->first()
                    : $ids->all();
            }
        }

        $field->config = $config;
        $field->save();
    }

    public function destroy(Project $project, CustomField $customField): JsonResponse
    {
        $this->authorizeProject($project);
        abort_if($customField->project_id !== $project->id, 404);

        $customField->delete();

        return response()->json(['success' => true]);
    }

    public function reorder(Request $request, Project $project): JsonResponse
    {
        $this->authorizeProject($project);

        $request->validate([
            'order' => ['required', 'array'],
            'order.*' => ['integer'],
        ]);

        foreach ($request->input('order') as $position => $id) {
            $project->customFields()->where('id', $id)->update(['position' => $position]);
        }

        return response()->json(['success' => true]);
    }
}
