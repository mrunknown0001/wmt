@php
    $appSettings = \App\Models\Setting::current();
    $palette = \App\Models\Setting::colorPalettes()[$appSettings->primary_color] ?? \App\Models\Setting::colorPalettes()['blue'];
@endphp
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title inertia>{{ $appSettings->app_name }}</title>
    <style>
        :root {
            --primary-50: {{ $palette['50'] }};
            --primary-100: {{ $palette['100'] }};
            --primary-200: {{ $palette['200'] }};
            --primary-300: {{ $palette['300'] }};
            --primary-400: {{ $palette['400'] }};
            --primary-500: {{ $palette['500'] }};
            --primary-600: {{ $palette['600'] }};
            --primary-700: {{ $palette['700'] }};
            --primary-800: {{ $palette['800'] }};
            --primary-900: {{ $palette['900'] }};
        }
    </style>
    <script>
        (function() {
            var theme = localStorage.getItem('theme');
            if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
            }
        })();
    </script>
    @viteReactRefresh
    @vite(['resources/css/app.css', 'resources/js/app.jsx'])
    @inertiaHead
</head>
<body class="antialiased">
    @inertia
</body>
</html>
