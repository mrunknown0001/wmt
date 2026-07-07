<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationPreferenceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json($request->user()->getNotificationPreferences());
    }

    public function update(Request $request): JsonResponse
    {
        $validKeys = array_keys(User::NOTIFICATION_DEFAULTS);

        $request->validate([
            'type' => ['required', 'string', 'in:' . implode(',', $validKeys)],
            'enabled' => ['required', 'boolean'],
        ]);

        $preferences = $request->user()->getNotificationPreferences();
        $preferences[$request->input('type')] = $request->boolean('enabled');

        $request->user()->update([
            'notification_preferences' => $preferences,
        ]);

        return response()->json(['message' => 'Notification preference updated.']);
    }
}
