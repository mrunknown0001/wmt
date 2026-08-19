<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Each person's own email notification preferences.
 *
 * These sit under the administrator's global channel settings rather than
 * beside them: the administrator decides which emails the system may send at
 * all, and this decides which of those the signed-in person actually wants.
 * Turning something on here cannot switch on a type the administrator has
 * disabled system-wide.
 *
 * Scoped to the authenticated user throughout — there is no user id in the
 * route, so one person cannot read or change another's settings.
 */
class NotificationPreferenceController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json($request->user()->getNotificationPreferences());
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['required', 'string', Rule::in(array_keys(User::NOTIFICATION_DEFAULTS))],
            'enabled' => ['required', 'boolean'],
        ]);

        $user = $request->user();

        // Merged over what is stored, not over the defaults-resolved view, so the
        // column keeps only the choices this person has actually made. A user who
        // has never opted out of anything stays empty, and later changes to the
        // defaults still reach them.
        $user->notification_preferences = array_merge(
            $user->notification_preferences ?? [],
            [$validated['type'] => $validated['enabled']],
        );

        $user->save();

        return response()->json(['message' => 'Notification preference updated.']);
    }
}
