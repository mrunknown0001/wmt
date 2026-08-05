{{ $app }}: backups are not reaching Google Drive.

{{ $reason }}

Until this is fixed, backups are written to local storage only. The nightly
backup will keep reporting success, because a missing Drive disk is dropped
from the destination list rather than failing the run.

To issue a new refresh token:

  1. Revoke this app at https://myaccount.google.com/permissions
     Google only returns a refresh token on first consent or after a revoke,
     so skipping this usually gets you a response with no token in it.

  2. On the server, run:
       php artisan backup:drive-token

  3. Put the new value in GOOGLE_DRIVE_REFRESH_TOKEN, then run:
       php artisan config:clear
       php artisan backup:check-token

  4. Confirm a backup can actually be written:
       php artisan backup:verify-drive

If this recurs every few days, the OAuth consent screen is still in Testing
mode. Set it to Production in the Google Cloud Console — that is what limits
tokens to seven days.
