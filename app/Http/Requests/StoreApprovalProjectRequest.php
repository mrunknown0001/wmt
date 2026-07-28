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
            'is_pinned' => 'nullable|boolean',
            // Series prefix is accepted only on creation — see the update request.
            'series_prefix' => ['nullable', 'string', 'max:20', 'regex:/^[A-Za-z0-9][A-Za-z0-9\-_\/]*$/'],
            'series_padding' => 'nullable|integer|min:1|max:10',
        ];
    }
}
