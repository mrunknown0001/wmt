<?php

namespace App\Http\Controllers;

use App\Support\RichText;
use App\Models\ApprovalProject;
use App\Models\ApprovalForm;
use App\Http\Requests\StoreApprovalFormRequest;
use App\Http\Requests\UpdateApprovalFormRequest;
use Illuminate\Support\Str;
use Inertia\Inertia;

class ApprovalFormController extends Controller
{
    private function authorizeProject(ApprovalProject $project): void
    {
        if (!auth()->user()->can('manage-approval-projects')
            && $project->owner_id !== auth()->id()
            && !$project->isProjectAdmin(auth()->user())) {
            abort(403);
        }
    }

    public function index(ApprovalProject $approvalProject)
    {
        $this->authorizeProject($approvalProject);

        $forms = $approvalProject->approvalForms()
            ->withCount('fields')
            ->with('creator')
            ->orderBy('created_at', 'desc')
            ->paginate(15);

        // Append public_url to each form
        $forms->each(function ($form) {
            $form->append('public_url');
        });

        return Inertia::render('ApprovalForms/Index', [
            'project' => $approvalProject,
            'forms' => $forms,
        ]);
    }

    public function create(ApprovalProject $approvalProject)
    {
        $this->authorizeProject($approvalProject);

        return Inertia::render('ApprovalForms/Create', [
            'project' => $approvalProject->load('customFields.options', 'sections'),
        ]);
    }

    public function store(StoreApprovalFormRequest $request, ApprovalProject $approvalProject)
    {
        $this->authorizeProject($approvalProject);

        $form = $approvalProject->approvalForms()->create([
            'name' => $request->name,
            'description' => RichText::sanitize($request->description),
            'uuid' => Str::uuid(),
            'is_active' => $request->is_active ?? true,
            'submit_button_text' => $request->submit_button_text ?? 'Submit',
            'success_message' => $request->success_message,
            'item_defaults' => $this->normalizeItemDefaults($request->item_defaults),
            'created_by' => auth()->id(),
            'logo_position' => $request->logo_position ?? 'left',
            'email_mode' => $request->email_mode ?? 'any',
        ]);

        // Handle logo upload
        if ($request->hasFile('logo')) {
            $path = $request->file('logo')->store('form-assets/logos', 'public');
            $form->update(['logo_path' => $path]);
        }

        // Handle banner upload
        if ($request->hasFile('banner')) {
            $path = $request->file('banner')->store('form-assets/banners', 'public');
            $form->update(['banner_path' => $path]);
        }

        // Create form fields
        foreach ($request->fields ?? [] as $index => $fieldData) {
            $form->fields()->create([
                'type' => $fieldData['type'],
                'label' => $fieldData['label'],
                'help_text' => RichText::sanitize($fieldData['help_text'] ?? null),
                'is_required' => $fieldData['is_required'] ?? false,
                'position' => $index,
                'config' => $fieldData['config'] ?? null,
                'maps_to' => $fieldData['maps_to'] ?? null,
                'custom_field_id' => $fieldData['custom_field_id'] ?? null,
                'default_value' => $fieldData['default_value'] ?? null,
                'is_visible' => $fieldData['is_visible'] ?? true,
                'conditions' => $fieldData['conditions'] ?? null,
            ]);
        }

        // Resolve field references in conditions (field_key → field_id)
        $this->resolveConditionKeys($form);

        return redirect()->route('approval-projects.forms.show', [$approvalProject, $form])
            ->with('success', 'Approval form created successfully.');
    }

    public function show(ApprovalProject $approvalProject, ApprovalForm $form)
    {
        $this->authorizeProject($approvalProject);
        abort_if($form->approval_project_id !== $approvalProject->id, 404);

        $form = $form->load('fields.customField.options');
        $form->append('public_url');

        return Inertia::render('ApprovalForms/Show', [
            'project' => $approvalProject,
            'form' => $form,
        ]);
    }

    public function edit(ApprovalProject $approvalProject, ApprovalForm $form)
    {
        $this->authorizeProject($approvalProject);
        abort_if($form->approval_project_id !== $approvalProject->id, 404);

        $logoUrl = $form->logo_path ? asset("storage/{$form->logo_path}") : null;
        $bannerUrl = $form->banner_path ? asset("storage/{$form->banner_path}") : null;

        return Inertia::render('ApprovalForms/Edit', [
            'project' => $approvalProject->load('customFields.options', 'sections'),
            'form' => $form->load('fields.customField.options'),
            'logoUrl' => $logoUrl,
            'bannerUrl' => $bannerUrl,
        ]);
    }

    public function update(UpdateApprovalFormRequest $request, ApprovalProject $approvalProject, ApprovalForm $form)
    {
        $this->authorizeProject($approvalProject);
        abort_if($form->approval_project_id !== $approvalProject->id, 404);

        $form->update([
            'name' => $request->name,
            'description' => RichText::sanitize($request->description),
            'is_active' => $request->is_active ?? true,
            'submit_button_text' => $request->submit_button_text ?? 'Submit',
            'success_message' => $request->success_message,
            'item_defaults' => $this->normalizeItemDefaults($request->item_defaults),
            'logo_position' => $request->logo_position ?? 'left',
            'email_mode' => $request->email_mode ?? 'any',
        ]);

        // Handle logo
        if ($request->hasFile('logo')) {
            if ($form->logo_path) {
                \Storage::disk('public')->delete($form->logo_path);
            }
            $path = $request->file('logo')->store('form-assets/logos', 'public');
            $form->update(['logo_path' => $path]);
        } elseif ($request->has('remove_logo')) {
            if ($form->logo_path) {
                \Storage::disk('public')->delete($form->logo_path);
            }
            $form->update(['logo_path' => null]);
        }

        // Handle banner
        if ($request->hasFile('banner')) {
            if ($form->banner_path) {
                \Storage::disk('public')->delete($form->banner_path);
            }
            $path = $request->file('banner')->store('form-assets/banners', 'public');
            $form->update(['banner_path' => $path]);
        } elseif ($request->has('remove_banner')) {
            if ($form->banner_path) {
                \Storage::disk('public')->delete($form->banner_path);
            }
            $form->update(['banner_path' => null]);
        }

        // Sync fields
        $keepFieldIds = collect($request->fields ?? [])
            ->filter(fn ($f) => isset($f['id']))
            ->pluck('id')
            ->toArray();

        $form->fields()->whereNotIn('id', $keepFieldIds)->delete();

        foreach ($request->fields ?? [] as $index => $fieldData) {
            if (isset($fieldData['id'])) {
                $form->fields()->find($fieldData['id'])?->update([
                    'type' => $fieldData['type'],
                    'label' => $fieldData['label'],
                    'help_text' => RichText::sanitize($fieldData['help_text'] ?? null),
                    'is_required' => $fieldData['is_required'] ?? false,
                    'position' => $index,
                    'config' => $fieldData['config'] ?? null,
                    'maps_to' => $fieldData['maps_to'] ?? null,
                    'custom_field_id' => $fieldData['custom_field_id'] ?? null,
                    'default_value' => $fieldData['default_value'] ?? null,
                    'is_visible' => $fieldData['is_visible'] ?? true,
                    'conditions' => $fieldData['conditions'] ?? null,
                ]);
            } else {
                $form->fields()->create([
                    'type' => $fieldData['type'],
                    'label' => $fieldData['label'],
                    'help_text' => RichText::sanitize($fieldData['help_text'] ?? null),
                    'is_required' => $fieldData['is_required'] ?? false,
                    'position' => $index,
                    'config' => $fieldData['config'] ?? null,
                    'maps_to' => $fieldData['maps_to'] ?? null,
                    'custom_field_id' => $fieldData['custom_field_id'] ?? null,
                    'default_value' => $fieldData['default_value'] ?? null,
                    'is_visible' => $fieldData['is_visible'] ?? true,
                    'conditions' => $fieldData['conditions'] ?? null,
                ]);
            }
        }

        $this->resolveConditionKeys($form);

        return redirect()->route('approval-projects.forms.show', [$approvalProject, $form])
            ->with('success', 'Approval form updated successfully.');
    }

    public function destroy(ApprovalProject $approvalProject, ApprovalForm $form)
    {
        $this->authorizeProject($approvalProject);
        abort_if($form->approval_project_id !== $approvalProject->id, 404);

        if ($form->logo_path) {
            \Storage::disk('public')->delete($form->logo_path);
        }
        if ($form->banner_path) {
            \Storage::disk('public')->delete($form->banner_path);
        }

        $form->delete();

        return redirect()->route('approval-projects.forms.index', $approvalProject)
            ->with('success', 'Approval form deleted successfully.');
    }

    public function toggle(ApprovalProject $approvalProject, ApprovalForm $form)
    {
        $this->authorizeProject($approvalProject);
        abort_if($form->approval_project_id !== $approvalProject->id, 404);

        $form->update(['is_active' => !$form->is_active]);

        return back()->with('success', "Form " . ($form->is_active ? 'activated' : 'deactivated') . ".");
    }

    private function normalizeItemDefaults(?array $defaults): ?array
    {
        if (!$defaults) {
            return null;
        }

        return [
            'status' => $defaults['status'] ?? null,
            'section_id' => $defaults['section_id'] ?? null,
            'title_field_ids' => array_map(
                fn ($val) => $val === 'assignee' ? 'assignee' : (int) $val,
                $defaults['title_field_ids'] ?? []
            ),
        ];
    }

    private function resolveConditionKeys(ApprovalForm $form): void
    {
        $savedFields = $form->fields()->get()->keyBy('id');
        $originalFields = $form->fields()->get()->keyBy(fn ($f) => "id:{$f->id}");

        foreach ($form->fields as $field) {
            if (!$field->conditions) {
                continue;
            }

            $conditions = $field->conditions;
            foreach ($conditions['rules'] ?? [] as &$rule) {
                $fieldKey = $rule['field_key'] ?? null;
                if (!$fieldKey) {
                    continue;
                }

                if (str_starts_with($fieldKey, 'id:')) {
                    $rule['field_id'] = (int) str_replace('id:', '', $fieldKey);
                } elseif (str_starts_with($fieldKey, 'pos:')) {
                    $position = (int) str_replace('pos:', '', $fieldKey);
                    $fieldAtPosition = $form->fields()->where('position', $position)->first();
                    if ($fieldAtPosition) {
                        $rule['field_id'] = $fieldAtPosition->id;
                    }
                }
                unset($rule['field_key']);
            }

            $field->update(['conditions' => $conditions]);
        }
    }
}
