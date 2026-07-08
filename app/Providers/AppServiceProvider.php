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

        try {
            Storage::extend('google', function ($app, $config) {
                $options = [];

                if (! empty($config['teamDriveId'] ?? null)) {
                    $options['teamDriveId'] = $config['teamDriveId'];
                }

                $client = new \Google\Client();
                $client->setClientId($config['clientId']);
                $client->setClientSecret($config['clientSecret']);
                $client->refreshToken($config['refreshToken']);

                $service = new \Google\Service\Drive($client);
                $adapter = new GoogleDriveAdapter($service, $config['folder'] ?? '', $options);
                $driver = new Filesystem($adapter);

                return new FilesystemAdapter($driver, $adapter);
            });
        } catch (\Exception $e) {
            // Google Drive credentials not configured — skip silently
        }
    }
}
