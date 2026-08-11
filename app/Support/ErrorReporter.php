<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Turns an unexpected exception into something a user can act on.
 *
 * An unhandled error is worthless to the person who hit it — "Server Error"
 * tells them nothing and gives support nothing to search for. This logs the
 * exception under a short reference and hands that same reference back to the
 * client, so the message on screen ("quote reference ERR-4821KP") and the line
 * in the log point at each other.
 *
 * Deliberately does nothing about *expected* failures — a validation error, a
 * 403, a 404. Those already say what is wrong; only genuine server faults pass
 * through here.
 */
class ErrorReporter
{
    /**
     * Log the exception under a fresh reference and return that reference.
     */
    public static function report(Throwable $e, ?Request $request = null): string
    {
        $reference = self::newReference();

        Log::error("[{$reference}] " . $e->getMessage(), [
            'reference' => $reference,
            'exception' => $e,
            'user_id' => $request?->user()?->id,
            'method' => $request?->method(),
            'url' => $request?->fullUrl(),
        ]);

        return $reference;
    }

    /**
     * A short reference the user can read over the phone.
     *
     * Uppercase and prefixed so it is obviously an error code and not, say, a
     * task id someone pasted into the wrong box.
     */
    public static function newReference(): string
    {
        return 'ERR-' . Str::upper(Str::random(6));
    }

    /**
     * The JSON body a client receives for an unexpected server error.
     *
     * The reference is woven into the sentence, not tucked in a corner, because
     * the whole point is that the user reads it out. `debug` rides along only
     * when the app is in debug mode, so a developer sees the cause without the
     * production response ever leaking it.
     */
    public static function payload(string $reference, ?Throwable $e = null, bool $debug = false): array
    {
        $body = [
            'message' => "Something went wrong on our end. Please try again — if it keeps happening, quote reference {$reference}.",
            'reference' => $reference,
        ];

        if ($debug && $e) {
            $body['debug'] = [
                'exception' => $e::class,
                'detail' => $e->getMessage(),
            ];
        }

        return $body;
    }
}
