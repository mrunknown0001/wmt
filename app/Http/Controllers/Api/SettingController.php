<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;

class SettingController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $settings = Setting::current();

        return response()->json([
            'app_name' => $settings->app_name,
            'primary_color' => $settings->primary_color,
            'max_upload_size' => (int) $settings->max_upload_size,
            'video_max_upload_size' => 50,
        ]);
    }
}
