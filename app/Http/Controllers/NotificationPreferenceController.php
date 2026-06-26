<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class NotificationPreferenceController extends Controller
{
    public function edit(Request $request): Response
    {
        return Inertia::render('Settings/NotificationPreferences', [
            'preferences' => $request->user()->getNotificationPreferences(),
            'defaults' => User::NOTIFICATION_DEFAULTS,
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $validKeys = array_keys(User::NOTIFICATION_DEFAULTS);

        $preferences = [];
        foreach ($validKeys as $key) {
            $preferences[$key] = (bool) $request->input($key, false);
        }

        $request->user()->update([
            'notification_preferences' => $preferences,
        ]);

        return redirect()->route('settings.notifications')
            ->with('success', 'Notification preferences updated.');
    }
}
