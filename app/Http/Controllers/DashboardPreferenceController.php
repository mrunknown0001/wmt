<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardPreferenceController extends Controller
{
    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'preferences' => ['required', 'array'],
            'preferences.*' => ['boolean'],
        ]);

        $allowed = array_keys(User::DASHBOARD_DEFAULTS);
        $filtered = array_intersect_key($validated['preferences'], array_flip($allowed));

        $user = $request->user();
        $user->update([
            'dashboard_preferences' => array_merge(
                $user->getDashboardPreferences(),
                $filtered
            ),
        ]);

        return response()->json(['preferences' => $user->getDashboardPreferences()]);
    }
}
