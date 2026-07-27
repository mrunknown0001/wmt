<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Notifications\ExternalWebhookNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Inbound webhook: an external platform raises an in-app notification for a user.
 *
 * POST /api/webhooks/notify
 *   headers: x-api-key, Accept: application/json
 *   body:    { "email": "...", "platform": "...", "url": "https://..." }
 */
class WebhookNotificationController extends Controller
{
    public function notify(Request $request): JsonResponse
    {
        // Accept one address or a list. Normalising to an array up front means the
        // email.* rule applies either way — a bare string would otherwise skip
        // format validation entirely.
        $request->merge(['email' => \Illuminate\Support\Arr::wrap($request->input('email'))]);

        $validated = $request->validate([
            'email' => ['required', 'array', 'min:1', 'max:50'],
            'email.*' => ['required', 'email', 'max:255'],
            'platform' => ['required', 'string', 'max:100'],
            // Only http(s): a javascript:/data: URL would become an XSS vector
            // once rendered as a clickable notification.
            'url' => ['required', 'string', 'max:2048', 'url', function ($attribute, $value, $fail) {
                if (!preg_match('#^https?://#i', $value)) {
                    $fail('The url must start with http:// or https://.');
                }
            }],
            'message' => ['nullable', 'string', 'max:500'],
        ]);

        $emails = collect($validated['email'])
            ->map(fn ($e) => trim((string) $e))
            ->filter()
            ->unique();

        $users = User::whereIn('email', $emails)->where('is_active', true)->get();
        $foundEmails = $users->pluck('email');
        $unknown = $emails->diff($foundEmails)->values();

        if ($users->isEmpty()) {
            return response()->json([
                'message' => 'No active user found for the given email address.',
                'unknown_emails' => $unknown,
            ], 404);
        }

        // `message` is optional, so it is absent from $validated when not sent —
        // resolve it once rather than indexing the array again below.
        $message = $validated['message'] ?? null;

        foreach ($users as $user) {
            // Push is not sent here: SendFcmNotification already fires off the
            // database channel, so pushing again produced two notifications per
            // webhook — one of them from this call, the other from the listener.
            $user->notify(new ExternalWebhookNotification(
                $validated['platform'],
                $validated['url'],
                $message,
            ));
        }

        return response()->json([
            'message' => 'Notification sent.',
            'notified' => $foundEmails->values(),
            'unknown_emails' => $unknown,
        ], 202);
    }
}
