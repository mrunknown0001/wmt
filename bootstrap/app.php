<?php

use App\Support\ErrorReporter;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Behind a reverse proxy (the Cloudflare Tunnel on staging/prod, Sail's
        // nginx in dev) the app only ever sees the proxy. Trusting it means
        // Laravel honours X-Forwarded-Proto/For, so it knows the request was
        // HTTPS and who the real client was — without this, secure cookies and
        // scheme-aware URLs get it wrong on anything served through the tunnel.
        // Safe here because the app is reachable only via that proxy.
        $middleware->trustProxies(at: '*');

        $middleware->statefulApi();
        $middleware->web(append: [
            \App\Http\Middleware\HandleInertiaRequests::class,
            \Illuminate\Session\Middleware\AuthenticateSession::class,
        ]);
        $middleware->alias([
            'webhook.key' => \App\Http\Middleware\VerifyWebhookApiKey::class,
            'role' => \Spatie\Permission\Middleware\RoleMiddleware::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Render JSON for api/* and for anything that actually asked for JSON.
        //
        // Limiting this to api/* meant a failed validation on a web route answered
        // a fetch() call with a 302 instead of a 422. The browser then followed the
        // redirect chain and reported ERR_TOO_MANY_REDIRECTS, so the real cause —
        // an invalid field — never reached the UI.
        //
        // Inertia is unaffected: it sends Accept: text/html, so expectsJson() is
        // false for it and its validation errors keep coming back as redirects,
        // which is how Inertia surfaces the `errors` prop.
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // Everything below acts on the *resolved* response, not the raw
        // exception — so Laravel has already mapped auth to 401, a policy to
        // 403, a missing model to 404, and a validation failure to 422 before we
        // look. That is deliberate: judging by status is what keeps an
        // unauthenticated request a clean 401 instead of a mislabelled 500.
        $exceptions->respond(function (Response $response, Throwable $exception, Request $request) {
            $status = $response->getStatusCode();
            $wantsJson = $request->is('api/*') || $request->expectsJson();

            // Unexpected server faults, for any client that asked for JSON, come
            // back as { message, reference } with the exception logged under that
            // reference — so a fetch() call has something to toast and support
            // has something to grep. Only 5xx: a 4xx already says what is wrong.
            if ($wantsJson && $status >= 500) {
                $reference = ErrorReporter::report($exception, $request);

                return response()->json(
                    ErrorReporter::payload($reference, $exception, (bool) config('app.debug')),
                    $status,
                );
            }

            // The Error *page* is for actual navigations. A fetch()/Inertia-JSON
            // caller expecting JSON must not have its body replaced with an HTML
            // page it cannot read — that was turning a readable error into an
            // inscrutable parse failure in the browser.
            if (! $wantsJson && in_array($status, [403, 404, 419, 429, 500, 503])) {
                return Inertia::render('Error', ['status' => $status])
                    ->toResponse($request)
                    ->setStatusCode($status);
            }

            return $response;
        });
    })->create();
