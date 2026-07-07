<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreFormRequest;
use App\Http\Requests\UpdateFormRequest;
use App\Models\Form;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class FormController extends Controller
{
    private function authorizeProject(Project $project): void
    {
        $user = auth()->user();
        if (!$user->can('manage-projects') && $project->owner_id !== $user->id && !$project->isProjectAdmin($user)) {
            abort(403);
        }
    }

    public function index(Project $project): Response
    {
        $this->authorizeProject($project);

        $forms = $project->forms()
            ->with('creator:id,name')
            ->withCount('fields')
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(fn ($form) => [
                ...$form->toArray(),
                'public_url' => $form->public_url,
            ]);

        return Inertia::render('Forms/Index', [
            'project' => $project->only('id', 'name'),
            'forms' => $forms,
        ]);
    }

    public function create(Project $project): Response
    {
        $this->authorizeProject($project);

        $customFields = $project->customFields()->with('options')->get();
        $sections = $project->sections()->orderBy('position')->get(['id', 'name']);

        return Inertia::render('Forms/Create', [
            'project' => $project->only('id', 'name'),
            'customFields' => $customFields,
            'sections' => $sections,
        ]);
    }

    public function store(StoreFormRequest $request, Project $project): RedirectResponse
    {
        $this->authorizeProject($project);

        $validated = $request->validated();
        $fields = $validated['fields'];
        unset($validated['fields']);

        $form = $project->forms()->create([
            ...$validated,
            'created_by' => $request->user()->id,
        ]);

        $savedFields = [];
        foreach ($fields as $fieldData) {
            $savedFields[] = $form->fields()->create($fieldData);
        }

        $this->resolveConditionKeys($savedFields, $fields);

        return redirect()->route('projects.forms.index', $project)
            ->with('success', 'Form created successfully.');
    }

    public function edit(Project $project, Form $form): Response
    {
        $this->authorizeProject($project);
        abort_if($form->project_id !== $project->id, 404);

        $form->load('fields');

        $customFields = $project->customFields()->with('options')->get();
        $sections = $project->sections()->orderBy('position')->get(['id', 'name']);

        return Inertia::render('Forms/Edit', [
            'project' => $project->only('id', 'name'),
            'form' => [
                ...$form->toArray(),
                'public_url' => $form->public_url,
            ],
            'customFields' => $customFields,
            'sections' => $sections,
        ]);
    }

    public function update(UpdateFormRequest $request, Project $project, Form $form): RedirectResponse
    {
        $this->authorizeProject($project);
        abort_if($form->project_id !== $project->id, 404);

        $validated = $request->validated();
        $fields = $validated['fields'];
        unset($validated['fields']);

        $form->update($validated);

        // Sync fields: keep existing by id, delete removed, create new
        $keepIds = collect($fields)->pluck('id')->filter()->toArray();
        $form->fields()->whereNotIn('id', $keepIds)->delete();

        $savedFields = [];
        foreach ($fields as $i => $fieldData) {
            if (!empty($fieldData['id'])) {
                $field = $form->fields()->where('id', $fieldData['id'])->first();
                if ($field) {
                    unset($fieldData['id']);
                    $field->update($fieldData);
                    $savedFields[$i] = $field;
                }
            } else {
                $savedFields[$i] = $form->fields()->create($fieldData);
            }
        }

        $this->resolveConditionKeys($savedFields, $fields);

        return redirect()->route('projects.forms.index', $project)
            ->with('success', 'Form updated successfully.');
    }

    /**
     * Resolve field_key references in conditions to field_id values.
     * field_key format: "id:{id}" for saved fields, "pos:{index}" for new fields.
     */
    private function resolveConditionKeys(array $savedFields, array $originalFields): void
    {
        // Build key-to-id mapping
        $keyToId = [];
        foreach ($savedFields as $i => $field) {
            $keyToId["id:{$field->id}"] = $field->id;
            $keyToId["pos:{$i}"] = $field->id;
        }

        foreach ($savedFields as $field) {
            $conditions = $field->conditions;
            if (empty($conditions['rules'])) {
                continue;
            }

            $changed = false;
            foreach ($conditions['rules'] as &$rule) {
                $key = $rule['field_key'] ?? null;
                if ($key && isset($keyToId[$key])) {
                    $rule['field_id'] = $keyToId[$key];
                    unset($rule['field_key']);
                    $changed = true;
                }
            }
            unset($rule);

            if ($changed) {
                $field->update(['conditions' => $conditions]);
            }
        }
    }

    public function destroy(Project $project, Form $form): RedirectResponse
    {
        $this->authorizeProject($project);
        abort_if($form->project_id !== $project->id, 404);

        $form->delete();

        return redirect()->route('projects.forms.index', $project)
            ->with('success', 'Form deleted successfully.');
    }

    public function toggle(Project $project, Form $form): JsonResponse
    {
        $this->authorizeProject($project);
        abort_if($form->project_id !== $project->id, 404);

        $form->update(['is_active' => !$form->is_active]);

        return response()->json(['form' => $form]);
    }
}
