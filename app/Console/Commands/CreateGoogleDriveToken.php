<?php

namespace App\Console\Commands;

use Google\Client as GoogleClient;
use Google\Service\Drive;
use Illuminate\Console\Command;

/**
 * Walks through Google's OAuth consent flow to obtain a Drive refresh token.
 *
 * A refresh token is the one credential that can't be generated from the Google
 * console — it only comes back from an authorisation the account holder performs
 * themselves. This runs that exchange from the terminal so nobody has to hand
 * their Google password to anything.
 */
class CreateGoogleDriveToken extends Command
{
    protected $signature = 'backup:drive-token
                            {--redirect=http://localhost : Redirect URI registered on the OAuth client}
                            {--scope= : Override the OAuth scope}';

    protected $description = 'Obtain a Google Drive refresh token for backups';

    public function handle(): int
    {
        $clientId = config('filesystems.disks.google.clientId');
        $clientSecret = config('filesystems.disks.google.clientSecret');

        if (empty($clientId) || empty($clientSecret)) {
            $this->error('GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET must be set first.');
            $this->line('');
            $this->line('In the Google Cloud console:');
            $this->line('  1. Enable the Google Drive API for your project');
            $this->line('  2. Credentials → Create credentials → OAuth client ID → Web application');
            $this->line('  3. Add an Authorised redirect URI of ' . $this->option('redirect'));
            $this->line('  4. Put the client id and secret in .env, then run this again');

            return self::FAILURE;
        }

        $redirect = $this->option('redirect');
        // drive.file limits access to files this app creates — it cannot read the
        // rest of the Drive. Ample for writing backups, and a far smaller blast
        // radius than full drive scope.
        $scope = $this->option('scope') ?: Drive::DRIVE_FILE;

        $client = new GoogleClient();
        $client->setClientId($clientId);
        $client->setClientSecret($clientSecret);
        $client->setRedirectUri($redirect);
        $client->setScopes([$scope]);
        // Both are required: without offline access Google returns no refresh
        // token, and without forcing the prompt it returns none on any repeat
        // authorisation — the usual reason this flow appears to "work" but yields
        // nothing usable.
        $client->setAccessType('offline');
        $client->setPrompt('consent');

        $this->line('');
        $this->warn('Before opening the link, the OAuth client must list this redirect URI');
        $this->warn('character for character — this is the usual cause of a rejected request:');
        $this->line('');
        $this->line('    ' . $redirect);
        $this->line('');
        $this->line('  Google Cloud console → Credentials → your OAuth 2.0 Client ID →');
        $this->line('  Authorised redirect URIs. No trailing slash: "' . $redirect . '/" is a');
        $this->line('  different URI to Google and will be refused. Changes can take a');
        $this->line('  minute to take effect.');
        $this->line('');

        if (! $this->confirm('Is ' . $redirect . ' registered on the client?', true)) {
            $this->line('');
            $this->line('Add it, then run this again. To use a different one:');
            $this->line('  php artisan backup:drive-token --redirect=http://localhost:8000/oauth');

            return self::FAILURE;
        }

        $this->line('');
        $this->info('1. Open this URL and approve access:');
        $this->line('');
        $this->line($client->createAuthUrl());
        $this->line('');
        $this->info('2. You will be redirected to ' . $redirect . '?code=...');
        $this->line('   The page may fail to load — that is fine, the code is in the URL.');
        $this->line('');

        $input = trim((string) $this->ask('3. Paste the code (or the whole redirected URL)'));

        if ($input === '') {
            $this->error('Nothing pasted — aborted.');
            return self::FAILURE;
        }

        $code = $this->extractCode($input);

        $this->line('');
        $this->line('Exchanging the code …');

        $token = $client->fetchAccessTokenWithAuthCode($code);

        if (isset($token['error'])) {
            $this->error('Google rejected the exchange: ' . $token['error']);
            $this->line('  ' . ($token['error_description'] ?? ''));
            $this->line('');
            $this->warn('Most often: the code was already used (each one works once),');
            $this->warn('or the redirect URI here does not exactly match the one registered.');
            $this->line('  this request used: ' . $redirect);

            return self::FAILURE;
        }

        $refreshToken = $token['refresh_token'] ?? null;

        if (! $refreshToken) {
            $this->error('Google returned no refresh token.');
            $this->warn('That happens when the account has already authorised this client.');
            $this->warn('Revoke it at https://myaccount.google.com/permissions and run this again.');

            return self::FAILURE;
        }

        // Confirm the token actually works before handing it over — otherwise the
        // first sign of trouble is a failed backup at 2am.
        $this->line('Verifying …');

        try {
            $client->setAccessToken($token);
            $about = (new Drive($client))->about->get(['fields' => 'user(emailAddress)']);
            $this->info('✓ authorised as ' . $about->getUser()->getEmailAddress());
        } catch (\Throwable $e) {
            $this->warn('! token obtained, but the verification call failed: ' . $e->getMessage());
        }

        $this->line('');
        $this->info('Add this to .env:');
        $this->line('');
        $this->line('GOOGLE_DRIVE_REFRESH_TOKEN=' . $refreshToken);
        $this->line('');
        $this->warn('Treat it like a password — it grants ongoing access to the Drive');
        $this->warn('files this app creates, and it will be in your shell history.');
        $this->line('');
        $this->line('Then: php artisan config:clear && php artisan backup:verify-drive');

        return self::SUCCESS;
    }

    /**
     * Accept either a bare code or the full redirected URL — people copy the
     * address bar far more often than they pick the parameter out of it.
     */
    private function extractCode(string $input): string
    {
        if (! str_contains($input, 'code=')) {
            return $input;
        }

        $query = parse_url($input, PHP_URL_QUERY) ?: $input;
        parse_str($query, $params);

        return $params['code'] ?? $input;
    }
}
