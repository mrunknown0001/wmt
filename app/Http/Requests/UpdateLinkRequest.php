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
            'user_id' => ['required', 'exists:users,id'],
        ];
    }
}
