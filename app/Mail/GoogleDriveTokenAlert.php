<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Tells whoever watches backups that Google Drive has stopped accepting them.
 *
 * A Mailable rather than Mail::raw() so the wording lives in a view somebody
 * can edit, and so the tests can actually see it — Laravel's mail fake ignores
 * raw sends entirely, which makes any assertion about them pass whether the
 * mail went out or not.
 */
class GoogleDriveTokenAlert extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public string $reason)
    {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: '[' . config('app.name') . '] Google Drive backup token needs attention',
        );
    }

    public function content(): Content
    {
        return new Content(
            text: 'emails.drive-token-alert',
            with: ['reason' => $this->reason, 'app' => config('app.name')],
        );
    }
}
