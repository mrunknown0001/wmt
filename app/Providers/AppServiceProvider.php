<?php

namespace App\Providers;

use App\Listeners\SendFcmNotification;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Notifications\Events\NotificationSent;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\ServiceProvider;
use League\Flysystem\Filesystem;
use Masbug\Flysystem\GoogleDriveAdapter;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        JsonResource::withoutWrapping();

        Event::listen(NotificationSent::class, SendFcmNotification::class);

        // Google Drive backup disk.
        //
        // The closure runs when the disk is first resolved, not at boot, so
        // registering it is free even when Drive isn't configured. The previous
        // try/catch here wrapped Storage::extend — which never throws — so it
        // caught nothing and hid nothing; the real failure happens on resolve.
        Storage::extend('google', function ($app, $config) {
            foreach (['clientId', 'clientSecret', 'refreshToken'] as $key) {
                if (empty($config[$key])) {
                    // A clear message beats the Google client's opaque failure.
                    throw new \RuntimeException(
                        "Google Drive disk is not configured: missing {$key}. "
                        . 'Set GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET and '
                        . 'GOOGLE_DRIVE_REFRESH_TOKEN, then run: php artisan backup:verify-drive'
                    );
                }
            }

            $options = [];

            if (! empty($config['teamDriveId'] ?? null)) {
                $options['teamDriveId'] = $config['teamDriveId'];
            }

            $client = new \Google\Client();
            $client->setClientId($config['clientId']);
            $client->setClientSecret($config['clientSecret']);
            // Exchanges the refresh token for an access token — a network call, so
            // it only happens when something actually uses the disk.
            $client->refreshToken($config['refreshToken']);

            $service = new \Google\Service\Drive($client);
            $adapter = new GoogleDriveAdapter($service, $config['folder'] ?? '', $options);
            $driver = new Filesystem($adapter);

            return new FilesystemAdapter($driver, $adapter);
        });
    }
}
