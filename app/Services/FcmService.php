<?php

namespace App\Services;

use App\Models\DeviceToken;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class FcmService
{
    /**
     * Send push notification to a user's registered devices via FCM v1 API.
     */
    public static function sendToUser(User $user, array $data): void
    {
        $credentialsPath = config('services.fcm.credentials');
        $projectId = config('services.fcm.project_id');

        if (! $credentialsPath || ! $projectId || ! file_exists($credentialsPath)) {
            return;
        }

        $tokens = DeviceToken::where('user_id', $user->id)->pluck('token')->toArray();

        if (empty($tokens)) {
            return;
        }

        $accessToken = self::getAccessToken($credentialsPath);
        if (! $accessToken) {
            return;
        }

        $url = "https://fcm.googleapis.com/v1/projects/{$projectId}/messages:send";

        foreach ($tokens as $token) {
            $payload = [
                'message' => [
                    'token' => $token,
                    'notification' => [
                        'title' => $data['title'] ?? config('app.name'),
                        'body' => $data['body'] ?? '',
                    ],
                    'data' => [
                        'type' => $data['type'] ?? 'general',
                        'task_id' => (string) ($data['task_id'] ?? ''),
                        'project_id' => (string) ($data['project_id'] ?? ''),
                        'notification_id' => (string) ($data['notification_id'] ?? ''),
                        'click_action' => 'OPEN_ACTIVITY',
                    ],
                    'android' => [
                        'priority' => 'high',
                        'notification' => [
                            'sound' => 'default',
                            'channel_id' => 'wmt_notifications',
                        ],
                    ],
                    'apns' => [
                        'payload' => [
                            'aps' => [
                                'sound' => 'default',
                                'badge' => 1,
                            ],
                        ],
                    ],
                    'webpush' => [
                        'notification' => [
                            'icon' => '/favicon.ico',
                        ],
                        'fcm_options' => [
                            'link' => '/',
                        ],
                    ],
                ],
            ];

            try {
                $response = Http::withToken($accessToken)
                    ->post($url, $payload);

                if ($response->status() === 404 || $response->status() === 400) {
                    $error = $response->json('error.details.0.errorCode', '');
                    if (in_array($error, ['UNREGISTERED', 'INVALID_ARGUMENT'])) {
                        DeviceToken::where('token', $token)->delete();
                    }
                }

                if ($response->failed()) {
                    Log::warning('FCM v1 send failed', [
                        'user_id' => $user->id,
                        'status' => $response->status(),
                        'error' => $response->json('error.message', ''),
                    ]);
                }
            } catch (\Exception $e) {
                Log::error('FCM send exception', ['error' => $e->getMessage()]);
            }
        }
    }

    /**
     * Get OAuth2 access token from service account credentials.
     * Cached for 55 minutes (tokens last 60 min).
     */
    private static function getAccessToken(string $credentialsPath): ?string
    {
        return Cache::remember('fcm_access_token', 3300, function () use ($credentialsPath) {
            try {
                $credentials = json_decode(file_get_contents($credentialsPath), true);

                $now = time();
                $header = base64url_encode(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
                $claims = base64url_encode(json_encode([
                    'iss' => $credentials['client_email'],
                    'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
                    'aud' => 'https://oauth2.googleapis.com/token',
                    'iat' => $now,
                    'exp' => $now + 3600,
                ]));

                $signature = '';
                openssl_sign(
                    "{$header}.{$claims}",
                    $signature,
                    $credentials['private_key'],
                    OPENSSL_ALGO_SHA256
                );
                $jwt = "{$header}.{$claims}." . base64url_encode($signature);

                $response = Http::asForm()->post('https://oauth2.googleapis.com/token', [
                    'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                    'assertion' => $jwt,
                ]);

                if ($response->successful()) {
                    return $response->json('access_token');
                }

                Log::error('FCM token exchange failed', ['body' => $response->body()]);
                return null;
            } catch (\Exception $e) {
                Log::error('FCM getAccessToken failed', ['error' => $e->getMessage()]);
                return null;
            }
        });
    }
}

/**
 * URL-safe base64 encode.
 */
function base64url_encode(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}
