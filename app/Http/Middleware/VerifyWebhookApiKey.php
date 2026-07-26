<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Authenticates inbound webhook calls with the x-api-key header.
 *
 * The endpoint is disabled (503) when no key is configured, so a deployment that
 * forgets to set WEBHOOK_API_KEY can't be called anonymously.
 */
class VerifyWebhookApiKey
{
    public function handle(Request $request, Closure $next): Response
    {
        $expected = config('services.webhook.api_key');

        if (empty($expected)) {
            return response()->json([
                'message' => 'Webhook endpoint is not configured.',
            ], 503);
        }

        $provided = $request->header('x-api-key', '');

        // hash_equals guards against timing attacks on the key comparison.
        if (!is_string($provided) || !hash_equals((string) $expected, $provided)) {
            return response()->json([
                'message' => 'Invalid or missing API key.',
            ], 401);
        }

        return $next($request);
    }
}
