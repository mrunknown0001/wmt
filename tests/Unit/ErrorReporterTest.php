<?php

namespace Tests\Unit;

use App\Support\ErrorReporter;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Tests\TestCase;

class ErrorReporterTest extends TestCase
{
    public function test_a_reference_is_a_readable_error_code(): void
    {
        $ref = ErrorReporter::newReference();

        // ERR- prefix so it is obviously an error code, then six characters.
        $this->assertMatchesRegularExpression('/^ERR-[A-Z0-9]{6}$/', $ref);
    }

    public function test_two_references_differ(): void
    {
        $this->assertNotSame(ErrorReporter::newReference(), ErrorReporter::newReference());
    }

    public function test_the_payload_weaves_the_reference_into_the_message(): void
    {
        $payload = ErrorReporter::payload('ERR-ABC123');

        $this->assertSame('ERR-ABC123', $payload['reference']);
        // The whole point is that the user reads it out, so it must be in the
        // sentence, not only in a field they never see.
        $this->assertStringContainsString('ERR-ABC123', $payload['message']);
        $this->assertArrayNotHasKey('debug', $payload);
    }

    public function test_debug_detail_rides_along_only_in_debug_mode(): void
    {
        $e = new RuntimeException('the real cause');

        $off = ErrorReporter::payload('ERR-ABC123', $e, false);
        $this->assertArrayNotHasKey('debug', $off);

        $on = ErrorReporter::payload('ERR-ABC123', $e, true);
        $this->assertSame(RuntimeException::class, $on['debug']['exception']);
        $this->assertSame('the real cause', $on['debug']['detail']);
    }

    public function test_report_logs_under_the_reference_it_returns(): void
    {
        Log::spy();

        $ref = ErrorReporter::report(new RuntimeException('boom'));

        $this->assertMatchesRegularExpression('/^ERR-[A-Z0-9]{6}$/', $ref);

        // The message on screen and the line in the log point at each other.
        Log::shouldHaveReceived('error')->once()->withArgs(
            fn ($message, $context = []) => str_contains($message, $ref)
                && ($context['reference'] ?? null) === $ref
        );
    }
}
