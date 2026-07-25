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

    /*
     * Per-purpose models. The app auto-routes each request to the right one:
     *   - vision    → an image or PDF is attached
     *   - documents → a Word/Excel/CSV file's text is in play
     *   - reasoning → the prompt asks for deep analysis
     *   - chat      → everything else (the default)
     *
     * Any purpose left blank falls back to `chat`, which itself falls back to the
     * platform's `model` above — so a single-model setup keeps working unchanged.
     * All ids are for the active platform (e.g. OpenRouter model slugs).
     */
    'models' => [
        'chat' => env('AI_MODEL_CHAT'),
        'vision' => env('AI_MODEL_VISION'),
        'reasoning' => env('AI_MODEL_REASONING'),
        'documents' => env('AI_MODEL_DOCUMENTS'),
    ],

    // Optional per-purpose response length; falls back to 2000.
    'purpose_max_tokens' => [
        'reasoning' => (int) env('AI_MAX_TOKENS_REASONING', 4000),
        'documents' => (int) env('AI_MAX_TOKENS_DOCUMENTS', 4000),
    ],

    'max_messages_per_conversation' => 10,
];
