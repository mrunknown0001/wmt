<?php

namespace App\Http\Controllers;

use App\Models\ApprovalProject;
use App\Models\ApprovalItem;
use App\Models\ApprovalItemComment;
use App\Models\ApprovalCommentAttachment;
use App\Http\Requests\StoreApprovalItemCommentRequest;
use App\Http\Requests\UpdateApprovalItemCommentRequest;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ApprovalItemCommentController extends Controller
{
    public function store(StoreApprovalItemCommentRequest $request, ApprovalProject $approvalProject, ApprovalItem $item)
    {
        $this->authorize('view', $item);
        abort_if($item->approval_project_id !== $approvalProject->id, 404);

        $comment = $item->comments()->create([
            'user_id' => auth()->id(),
            'body' => $request->body,
        ]);

        // Handle file attachments
        if ($request->hasFile('attachments')) {
            foreach ($request->file('attachments') as $file) {
                $filePath = $file->store("comment-attachments/{$comment->id}", 'public');

                $comment->attachments()->create([
                    'file_name' => $file->getClientOriginalName(),
                    'file_path' => $filePath,
                    'file_type' => $file->getMimeType(),
                    'file_size' => $file->getSize(),
                ]);
            }
        }

        return redirect()->back()->with('success', 'Comment added successfully.');
    }

    public function update(UpdateApprovalItemCommentRequest $request, ApprovalProject $approvalProject, ApprovalItem $item, ApprovalItemComment $comment)
    {
        $this->authorize('view', $item);
        abort_if($item->approval_project_id !== $approvalProject->id, 404);
        abort_if($comment->approval_item_id !== $item->id, 404);
        abort_if($comment->user_id !== auth()->id(), 403);

        $comment->update([
            'body' => $request->body,
        ]);

        return redirect()->back()->with('success', 'Comment updated successfully.');
    }

    public function destroy(ApprovalProject $approvalProject, ApprovalItem $item, ApprovalItemComment $comment)
    {
        $this->authorize('view', $item);
        abort_if($item->approval_project_id !== $approvalProject->id, 404);
        abort_if($comment->approval_item_id !== $item->id, 404);
        abort_if($comment->user_id !== auth()->id() && !auth()->user()->can('manage-approval-projects'), 403);

        // Delete attachments from disk
        foreach ($comment->attachments as $attachment) {
            if (Storage::disk('public')->exists($attachment->file_path)) {
                Storage::disk('public')->delete($attachment->file_path);
            }
        }

        $comment->delete();

        return redirect()->back()->with('success', 'Comment deleted successfully.');
    }

    public function download(ApprovalProject $approvalProject, ApprovalItem $item, ApprovalItemComment $comment, ApprovalCommentAttachment $attachment): StreamedResponse
    {
        $this->authorize('view', $item);
        abort_if($item->approval_project_id !== $approvalProject->id, 404);
        abort_if($comment->approval_item_id !== $item->id, 404);
        abort_if($attachment->approval_item_comment_id !== $comment->id, 404);

        return Storage::disk('public')->download($attachment->file_path, $attachment->file_name);
    }
}
