<?php

namespace App\Services;

/**
 * Chooses which configured model handles a chat turn, based on what the turn
 * contains. Auto-routing so users never pick a model manually:
 *
 *   image/PDF attached      → 'vision'
 *   Word/Excel/CSV in play  → 'documents'
 *   deep-analysis prompt    → 'reasoning'
 *   otherwise               → 'chat'
 *
 * Each purpose falls back to 'chat', then to the platform's default model, so an
 * unconfigured purpose still works.
 */
class AiModelRouter
{
    /** Phrases that signal the user wants heavier reasoning. */
    private const REASONING_PATTERN = '/\b(analys|analyz|deep|in[- ]?depth|thorough|step[- ]?by[- ]?step|reasoning|breakdown|root cause|explain in detail|comprehensive)\b/i';

    public static function purposeFor(bool $hasVisionMedia, bool $hasDocument, string $prompt): string
    {
        if ($hasVisionMedia) {
            return 'vision';
        }
        if ($hasDocument) {
            return 'documents';
        }
        if (preg_match(self::REASONING_PATTERN, $prompt)) {
            return 'reasoning';
        }

        return 'chat';
    }

    /** Resolve a purpose to a concrete model id, with graceful fallback. */
    public static function modelFor(string $purpose): string
    {
        $models = config('ai.models', []);
        $platform = config('ai.platform', 'openai');
        $platformDefault = config("ai.{$platform}.model");

        $chat = $models['chat'] ?: $platformDefault;

        return ($models[$purpose] ?? null) ?: $chat;
    }

    public static function maxTokensFor(string $purpose): int
    {
        return config("ai.purpose_max_tokens.{$purpose}", 2000);
    }

    /** @return array{purpose:string, model:string, max_tokens:int} */
    public static function route(bool $hasVisionMedia, bool $hasDocument, string $prompt): array
    {
        $purpose = self::purposeFor($hasVisionMedia, $hasDocument, $prompt);

        return [
            'purpose' => $purpose,
            'model' => self::modelFor($purpose),
            'max_tokens' => self::maxTokensFor($purpose),
        ];
    }
}
