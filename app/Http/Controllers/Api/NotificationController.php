<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filter = $request->query('filter', 'inbox');

        $query = $request->user()->notifications();

        switch ($filter) {
            case 'unread':
                $query->whereNull('read_at')->whereNull('archived_at');
                break;
            case 'bookmarked':
                $query->whereNotNull('bookmarked_at')->whereNull('archived_at');
                break;
            case 'archived':
                $query->whereNotNull('archived_at');
                break;
            case 'mentioned':
                $query->where('type', 'like', '%TaskCommentMentionNotification')
                    ->whereNull('archived_at');
                break;
            default:
                $query->whereNull('archived_at');
                break;
        }

        $notifications = $query->paginate(20);

        $notifications->getCollection()->transform(fn ($n) => [
            'id' => $n->id,
            'data' => $n->data,
            'read_at' => $n->read_at?->toIso8601String(),
            'bookmarked_at' => $n->bookmarked_at?->toIso8601String(),
            'archived_at' => $n->archived_at?->toIso8601String(),
            'created_at' => $n->created_at->toIso8601String(),
        ]);

        return response()->json($notifications);
    }

    public function unreadCount(Request $request): JsonResponse
    {
        return response()->json([
            'count' => $request->user()->unreadNotifications()->whereNull('archived_at')->count(),
        ]);
    }

    public function markAsRead(Request $request, string $id): JsonResponse
    {
        $notification = $request->user()
            ->notifications()
            ->findOrFail($id);

        $notification->markAsRead();

        return response()->json(['success' => true]);
    }

    public function markAllAsRead(Request $request): JsonResponse
    {
        $request->user()->unreadNotifications->markAsRead();

        return response()->json(['success' => true]);
    }

    public function toggleBookmark(Request $request, string $id): JsonResponse
    {
        $notification = $request->user()
            ->notifications()
            ->findOrFail($id);

        $notification->update([
            'bookmarked_at' => $notification->bookmarked_at ? null : now(),
        ]);

        return response()->json([
            'success' => true,
            'bookmarked' => !is_null($notification->fresh()->bookmarked_at),
        ]);
    }

    public function archive(Request $request, string $id): JsonResponse
    {
        $notification = $request->user()
            ->notifications()
            ->findOrFail($id);

        $notification->update(['archived_at' => now()]);

        return response()->json(['success' => true]);
    }

    public function unarchive(Request $request, string $id): JsonResponse
    {
        $notification = $request->user()
            ->notifications()
            ->findOrFail($id);

        $notification->update(['archived_at' => null]);

        return response()->json(['success' => true]);
    }
}
