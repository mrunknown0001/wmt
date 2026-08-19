<?php

namespace App\Http\Controllers\Api;

use App\Models\ApprovalCommentAttachment;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreApprovalItemCommentRequest;
use App\Http\Requests\UpdateApprovalItemCommentRequest;
use App\Models\ApprovalItem;
use App\Models\ApprovalItemComment;
use App\Models\ApprovalProject;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Mobile API for comments on an approval request, including attachments.
 * Reuses the web form requests so validation rules stay identical.
 */
class ApprovalItemCommentController extends Controller
{
    public function index(Request $request, ApprovalProject $approvalProject, ApprovalItem $item): JsonResponse
    {
        $this->authorize('view', $item);
        abort_if($item->approval_project_id !== $approvalProject->id, 404);

        $comments = $item->comments()
            ->with('user:id,name', 'attachments')
            ->orderBy('created_at')
            ->paginate(30);

        $comments->getCollection()->each(function ($comment) {
            $comment->attachments->each->append('url');
        });

        return response()->json($comments);
    }

    public function store(StoreApprovalItemCommentRequest $request, ApprovalProject $approvalProject, ApprovalItem $item): JsonResponse
    {
        $this->authorize('view', $item);
        abort_if($item->approval_project_id !== $approvalProject->id, 404);

        $comment = $item->comments()->create([
            'user_id' => $request->user()->id,
            'body' => $request->body ?? '',
        ]);

        if ($request->hasFile('attachments')) {
            foreach ($request->file('attachments') as $file) {
                if (!$file || !$file->isValid()) {
                    continue;
                }
                $comment->attachments()->create([
                    'file_name' => $file->getClientOriginalName(),
                    'file_path' => $file->store("comment-attachments/{$comment->id}", ApprovalCommentAttachment::DISK),
                    'file_type' => $file->getMimeType(),
                    'file_size' => $file->getSize(),
                ]);
            }
        }

        $comment->load('user:id,name', 'attachments');
        $comment->attachments->each->append('url');

        return response()->json(['comment' => $comment], 201);
    }

    public function update(UpdateApprovalItemCommentRequest $request, ApprovalProject $approvalProject, ApprovalItem $item, ApprovalItemComment $comment): JsonResponse
    {
        $this->authorize('view', $item);
        abort_if($comment->approval_item_id !== $item->id, 404);
        abort_if($comment->user_id !== $request->user()->id, 403);

        $comment->update(['body' => $request->body]);

        return response()->json(['comment' => $comment->fresh()->load('user:id,name', 'attachments')]);
    }

    public function destroy(Request $request, ApprovalProject $approvalProject, ApprovalItem $item, ApprovalItemComment $comment): JsonResponse
    {
        $this->authorize('view', $item);
        abort_if($comment->approval_item_id !== $item->id, 404);
        abort_if($comment->user_id !== $request->user()->id, 403);

        $comment->delete();

        return response()->json(['success' => true]);
    }
}
