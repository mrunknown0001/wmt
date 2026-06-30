<?php

namespace App\Http\Requests\Auth;

use App\Rules\Turnstile;
use Illuminate\Foundation\Http\FormRequest;

class LoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $rules = [
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
            'remember' => ['boolean'],
        ];

        if (config('services.turnstile.secret_key')) {
            $rules['cf-turnstile-response'] = ['required', new Turnstile];
        }

        return $rules;
    }

    public function messages(): array
    {
        return [
            'cf-turnstile-response.required' => 'Please complete the captcha verification.',
        ];
    }
}
