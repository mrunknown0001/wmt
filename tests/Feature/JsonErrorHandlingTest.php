<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;
use RuntimeException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * How the app answers a failed request that asked for JSON.
 *
 * The contract the frontend relies on: an unexpected fault comes back as a
 * readable { message, reference } with status 500 — never an HTML error page a
 * fetch() call cannot parse — while expected failures (403, 404, 422) keep
 * their own shapes. Throwaway routes stand in for "some controller blew up".
 */
class JsonErrorHandlingTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Route::middleware('web')->group(function () {
            Route::get('/_test/throw', fn () => throw new RuntimeException('kaboom'));
            Route::get('/_test/http/{status}', fn (int $status) => throw new HttpException($status, 'nope'));
        });
    }

    public function test_an_unexpected_error_returns_a_reference_a_user_can_quote(): void
    {
        $response = $this->getJson('/_test/throw');

        $response->assertStatus(500);
        $reference = $response->json('reference');

        $this->assertMatchesRegularExpression('/^ERR-[A-Z0-9]{6}$/', $reference);
        // The reference is in the sentence, so the person on the phone can read it.
        $this->assertStringContainsString($reference, $response->json('message'));
    }

    public function test_the_error_is_logged_under_the_same_reference(): void
    {
        Log::spy();

        $reference = $this->getJson('/_test/throw')->json('reference');

        Log::shouldHaveReceived('error')->withArgs(
            fn ($message, $context = []) => ($context['reference'] ?? null) === $reference
        );
    }

    public function test_a_forbidden_request_keeps_its_own_status_not_a_500(): void
    {
        // 4xx are expected failures; they must not be dressed up as server faults
        // or the frontend would show "something went wrong" for a plain refusal.
        $response = $this->getJson('/_test/http/403');

        $response->assertStatus(403);
        $this->assertNull($response->json('reference'));
    }

    public function test_a_not_found_request_keeps_its_own_status(): void
    {
        $this->getJson('/_test/http/404')->assertStatus(404);
    }

    public function test_a_real_server_side_http_500_still_gets_a_reference(): void
    {
        $this->getJson('/_test/http/500')
            ->assertStatus(500)
            ->assertJsonStructure(['message', 'reference']);
    }
}
