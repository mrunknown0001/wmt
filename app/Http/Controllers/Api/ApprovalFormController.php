<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApprovalForm;
use App\Models\ApprovalProject;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Mobile API for approval intake forms. `publicShow` is unauthenticated so the
 * app can render a public form; submission posts to the shared public endpoint
 * (/forms-approval/{uuid}) with Accept: application/json.
 */
class ApprovalFormController extends Controller
{
    public function index(Request $request, ApprovalProject $approvalProject): JsonResponse
    {
        $this->authorize('view', $approvalProject);

        return response()->json([
            'forms' => $approvalProject->forms()
                ->withCount('fields')
                ->orderBy('name')
                ->get(['id', 'uuid', 'name', 'description', 'is_active', 'approval_project_id']),
        ]);
    }

    /** Field definitions for rendering a public form in the app. */
    public function publicShow(string $uuid): JsonResponse
    {
        $form = ApprovalForm::where('uuid', $uuid)->where('is_active', true)->first();

        abort_if(!$form, 404);

        $fields = $form->fields()
            ->where('is_visible', true)
            ->get()
            ->map(function ($field) {
                $data = $field->toArray();
                if ($field->custom_field_id && $field->customField) {
                    $data['options'] = $field->customField->options;
                } elseif ($field->config['options'] ?? null) {
                    $data['options'] = $field->config['options'];
                }
                return $data;
            });

        return response()->json([
            'form' => $form->only(['id', 'uuid', 'name', 'description', 'submit_button_text', 'success_message', 'email_mode']),
            'fields' => $fields,
            'submit_url' => url("/forms-approval/{$form->uuid}"),
            'turnstile' => [
                'enabled' => (bool) config('services.turnstile.enabled', false),
                'siteKey' => config('services.turnstile.site_key'),
            ],
        ]);
    }
}
