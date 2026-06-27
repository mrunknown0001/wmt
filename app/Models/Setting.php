<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

class Setting extends Model
{
    protected $fillable = ['app_name', 'primary_color', 'max_upload_size', 'task_reminder_days', 'task_reminders_enabled'];

    protected function casts(): array
    {
        return [
            'task_reminder_days' => 'array',
            'task_reminders_enabled' => 'boolean',
        ];
    }

    public static function current(): self
    {
        $attributes = Cache::rememberForever('app_settings', function () {
            return static::firstOrCreate([], [
                'app_name' => 'WMT',
                'primary_color' => 'blue',
                'max_upload_size' => 10,
                'task_reminder_days' => [7, 3, 1],
                'task_reminders_enabled' => true,
            ])->attributesToArray();
        });

        $instance = (new static)->forceFill($attributes)->syncOriginal();
        $instance->exists = true;

        return $instance;
    }

    public static function clearCache(): void
    {
        Cache::forget('app_settings');
    }

    public static function colorPalettes(): array
    {
        return [
            'blue' => [
                '50' => '#eff6ff', '100' => '#dbeafe', '200' => '#bfdbfe',
                '300' => '#93c5fd', '400' => '#60a5fa', '500' => '#3b82f6',
                '600' => '#2563eb', '700' => '#1d4ed8', '800' => '#1e40af', '900' => '#1e3a8a',
            ],
            'indigo' => [
                '50' => '#eef2ff', '100' => '#e0e7ff', '200' => '#c7d2fe',
                '300' => '#a5b4fc', '400' => '#818cf8', '500' => '#6366f1',
                '600' => '#4f46e5', '700' => '#4338ca', '800' => '#3730a3', '900' => '#312e81',
            ],
            'violet' => [
                '50' => '#f5f3ff', '100' => '#ede9fe', '200' => '#ddd6fe',
                '300' => '#c4b5fd', '400' => '#a78bfa', '500' => '#8b5cf6',
                '600' => '#7c3aed', '700' => '#6d28d9', '800' => '#5b21b6', '900' => '#4c1d95',
            ],
            'teal' => [
                '50' => '#f0fdfa', '100' => '#ccfbf1', '200' => '#99f6e4',
                '300' => '#5eead4', '400' => '#2dd4bf', '500' => '#14b8a6',
                '600' => '#0d9488', '700' => '#0f766e', '800' => '#115e59', '900' => '#134e4a',
            ],
            'green' => [
                '50' => '#f0fdf4', '100' => '#dcfce7', '200' => '#bbf7d0',
                '300' => '#86efac', '400' => '#4ade80', '500' => '#22c55e',
                '600' => '#16a34a', '700' => '#15803d', '800' => '#166534', '900' => '#14532d',
            ],
            'red' => [
                '50' => '#fef2f2', '100' => '#fee2e2', '200' => '#fecaca',
                '300' => '#fca5a5', '400' => '#f87171', '500' => '#ef4444',
                '600' => '#dc2626', '700' => '#b91c1c', '800' => '#991b1b', '900' => '#7f1d1d',
            ],
            'orange' => [
                '50' => '#fff7ed', '100' => '#ffedd5', '200' => '#fed7aa',
                '300' => '#fdba74', '400' => '#fb923c', '500' => '#f97316',
                '600' => '#ea580c', '700' => '#c2410c', '800' => '#9a3412', '900' => '#7c2d12',
            ],
            'rose' => [
                '50' => '#fff1f2', '100' => '#ffe4e6', '200' => '#fecdd3',
                '300' => '#fda4af', '400' => '#fb7185', '500' => '#f43f5e',
                '600' => '#e11d48', '700' => '#be123c', '800' => '#9f1239', '900' => '#881337',
            ],
        ];
    }
}
