<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateLinkRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('manage-links');
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'url' => ['nullable', 'url', 'max:2048'],
            // Assignment moved to the polymorphic assignments list; user_id is kept
            // optional so older payloads (and single-assignee links) still work.
            'user_id' => ['nullable', 'exists:users,id'],
            'assignments' => ['nullable', 'array'],
            'assignments.*.type' => ['required_with:assignments', 'string', 'in:user,team,department,division,role,group'],
            'assignments.*.id' => ['required_with:assignments', 'integer', 'min:1'],
        ];
    }
}
