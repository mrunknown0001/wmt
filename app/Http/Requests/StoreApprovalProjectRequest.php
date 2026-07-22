<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreApprovalProjectRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:1000',
            'status' => 'nullable|string|in:active,on_hold,completed,archived',
            'owner_id' => 'nullable|exists:users,id',
            'co_owner_ids' => 'nullable|array',
            'co_owner_ids.*' => 'integer|exists:users,id',
            'due_date' => 'nullable|date',
            'is_pinned' => 'nullable|boolean',
        ];
    }
}
