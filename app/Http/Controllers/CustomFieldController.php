<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreCustomFieldRequest;
use App\Http\Requests\UpdateCustomFieldRequest;
use App\Models\CustomField;
use App\Models\CustomFieldOption;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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

        // Field + its options + its default are one unit: if the options fail
        // halfway, a field with no choices is worse than no field at all, so the
        // whole thing rolls back rather than leaving a broken half.
        $field = DB::transaction(function () use ($project, $validated, $options, $defaultOptionIndexes) {
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

            return $field;
        });

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

        // Reconciling options means deletes, updates and inserts in sequence —
        // exactly the kind of multi-step change that must be all-or-nothing, or
        // a failure halfway leaves the field describing options it no longer has.
        DB::transaction(function () use ($customField, $validated, $options, $defaultOptionIndexes) {
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
        });

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

        // All positions move together — a half-applied reorder is a scrambled
        // list, which is harder to recover from than one that never moved.
        DB::transaction(function () use ($request, $project) {
            foreach ($request->input('order') as $position => $id) {
                $project->customFields()->where('id', $id)->update(['position' => $position]);
            }
        });

        return response()->json(['success' => true]);
    }
}
