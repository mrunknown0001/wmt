<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateSettingRequest;
use App\Models\Setting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Storage;
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
            'notificationChannelDefaults' => Setting::NOTIFICATION_CHANNEL_DEFAULTS,
        ]);
    }

    public function update(UpdateSettingRequest $request): RedirectResponse
    {
        $settings = Setting::current();
        $data = Arr::except($request->validated(), ['logo', 'favicon', 'remove_logo', 'remove_favicon']);

        if ($request->hasFile('logo')) {
            $this->deleteBrandingFile($settings->logo_path);
            $data['logo_path'] = $request->file('logo')->store('branding', 'public');
        } elseif ($request->boolean('remove_logo')) {
            $this->deleteBrandingFile($settings->logo_path);
            $data['logo_path'] = null;
        }

        if ($request->hasFile('favicon')) {
            $this->deleteBrandingFile($settings->favicon_path);
            $data['favicon_path'] = $request->file('favicon')->store('branding', 'public');
        } elseif ($request->boolean('remove_favicon')) {
            $this->deleteBrandingFile($settings->favicon_path);
            $data['favicon_path'] = null;
        }

        $settings->update($data);
        Setting::clearCache();

        return redirect()->route('settings.edit')
            ->with('success', 'Settings updated successfully.');
    }

    private function deleteBrandingFile(?string $path): void
    {
        if ($path) {
            Storage::disk('public')->delete($path);
        }
    }
}
