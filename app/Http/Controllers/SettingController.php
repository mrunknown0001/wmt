<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateSettingRequest;
use App\Models\Setting;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class SettingController extends Controller
{
    public function edit(): Response
    {
        abort_unless(auth()->user()->hasRole('admin'), 403);

        return Inertia::render('Settings/Edit', [
            'settings' => Setting::current(),
            'colorPalettes' => Setting::colorPalettes(),
        ]);
    }

    public function update(UpdateSettingRequest $request): RedirectResponse
    {
        $settings = Setting::current();
        $settings->update($request->validated());
        Setting::clearCache();

        return redirect()->route('settings.edit')
            ->with('success', 'Settings updated successfully.');
    }
}
