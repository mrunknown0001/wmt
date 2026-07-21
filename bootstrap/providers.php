<?php

use App\Providers\AppServiceProvider;
use Tightenco\Ziggy\ZiggyServiceProvider;

return [
    AppServiceProvider::class,
    \Illuminate\Broadcasting\BroadcastServiceProvider::class,
    ZiggyServiceProvider::class,
];
