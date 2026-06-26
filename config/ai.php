<?php

return [
    'platform' => env('AI_PLATFORM', 'openai'),

    'openai' => [
        'api_key' => env('OPENAI_API_KEY'),
        'model' => env('OPENAI_MODEL', 'gpt-4o'),
        'base_url' => 'https://api.openai.com/v1',
    ],

    'openrouter' => [
        'api_key' => env('OPENROUTER_API_KEY'),
        'model' => env('OPENROUTER_MODEL', 'openai/gpt-4o'),
        'base_url' => 'https://openrouter.ai/api/v1',
    ],

    'max_messages_per_conversation' => 10,
];
