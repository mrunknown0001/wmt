<?php

namespace App\Http\Controllers;

use App\Models\ApprovalCommentAttachment;
use App\Models\ApprovalItemAttachment;
use App\Models\CommentAttachment;
use App\Models\TaskAttachment;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The only way to read an uploaded file.
 *
 * Attachments live on a private disk that is not reachable over HTTP, so every
 * download arrives here and is authorized against whatever the file hangs off —
 * its task, or its approval request. Holding the URL is not itself permission:
 * a link that leaks, or a person who later loses access, gets a 403.
 *
 * Routes are keyed on the attachment alone rather than nested under a project or
 * task. The parent chain is read from the record, so a caller cannot pair an
 * attachment id with some other task's id to sidestep the check.
 */
class AttachmentController extends Controller
{
    public function task(TaskAttachment $attachment): StreamedResponse
    {
        $task = $attachment->task;
        abort_if(!$task, 404);

        $this->authorize('view', $task);

        return $attachment->toDownloadResponse();
    }

    public function taskComment(CommentAttachment $attachment): StreamedResponse
    {
        $task = $attachment->comment?->task;
        abort_if(!$task, 404);

        // A comment's file is readable by whoever can read the task it sits on.
        $this->authorize('view', $task);

        return $attachment->toDownloadResponse();
    }

    public function approvalItem(ApprovalItemAttachment $attachment): StreamedResponse
    {
        $item = $attachment->item;
        abort_if(!$item, 404);

        $this->authorize('view', $item);

        return $attachment->toDownloadResponse();
    }

    public function approvalItemComment(ApprovalCommentAttachment $attachment): StreamedResponse
    {
        $item = $attachment->comment?->item;
        abort_if(!$item, 404);

        $this->authorize('view', $item);

        return $attachment->toDownloadResponse();
    }
}
