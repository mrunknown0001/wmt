<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class NotificationController extends Controller
{
    public function index(Request $request): Response
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
            default: // inbox
                $query->whereNull('archived_at');
                break;
        }

        $notifications = $query->paginate(15)->appends(['filter' => $filter]);

        return Inertia::render('Inbox/Index', [
            'notifications' => $notifications,
            'filter' => $filter,
        ]);
    }

    public function markAsRead(Request $request, string $id): RedirectResponse
    {
        $notification = $request->user()
            ->notifications()
            ->findOrFail($id);

        $notification->markAsRead();

        return back();
    }

    public function recent(Request $request): JsonResponse
    {
        $notifications = $request->user()
            ->notifications()
            ->whereNull('archived_at')
            ->take(5)
            ->get()
            ->map(fn ($n) => [
                'id' => $n->id,
                'data' => $n->data,
                'read_at' => $n->read_at?->toIso8601String(),
                'bookmarked_at' => $n->bookmarked_at?->toIso8601String(),
                'created_at' => $n->created_at->toIso8601String(),
            ]);

        return response()->json(['notifications' => $notifications]);
    }

    public function markAllAsRead(Request $request): RedirectResponse
    {
        $request->user()->unreadNotifications->markAsRead();

        return back()->with('success', 'All notifications marked as read.');
    }

    public function toggleBookmark(Request $request, string $id): RedirectResponse
    {
        $notification = $request->user()
            ->notifications()
            ->findOrFail($id);

        $notification->update([
            'bookmarked_at' => $notification->bookmarked_at ? null : now(),
        ]);

        return back();
    }

    public function archive(Request $request, string $id): RedirectResponse
    {
        $notification = $request->user()
            ->notifications()
            ->findOrFail($id);

        $notification->update([
            'archived_at' => now(),
        ]);

        return back();
    }

    public function unarchive(Request $request, string $id): RedirectResponse
    {
        $notification = $request->user()
            ->notifications()
            ->findOrFail($id);

        $notification->update([
            'archived_at' => null,
        ]);

        return back();
    }
}
