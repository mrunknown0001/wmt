<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class ActivityLogController extends Controller
{
    public function index(Request $request): Response
    {
        if (!$request->user()->hasRole('admin')) {
            abort(403);
        }

        $userId     = $request->input('user_id');
        $entityType = $request->input('entity_type');
        $action     = $request->input('action');
        $dateFrom   = $request->input('date_from');
        $dateTo     = $request->input('date_to');
        $search     = $request->input('search');

        $query = ActivityLog::with('user')
            ->orderBy('created_at', 'desc');

        if ($userId) {
            $query->where('user_id', $userId);
        }
        if ($entityType) {
            $query->where('entity_type', $entityType);
        }
        if ($action) {
            $query->where('action', $action);
        }
        if ($dateFrom) {
            $query->whereDate('created_at', '>=', $dateFrom);
        }
        if ($dateTo) {
            $query->whereDate('created_at', '<=', $dateTo);
        }
        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('entity_name', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%")
                  ->orWhere('field', 'like', "%{$search}%");
            });
        }

        $activities = $query->paginate(30)->withQueryString();

        // Build base query for charts (same filters, no pagination)
        $baseQuery = ActivityLog::query();
        if ($userId) $baseQuery->where('user_id', $userId);
        if ($entityType) $baseQuery->where('entity_type', $entityType);
        if ($action) $baseQuery->where('action', $action);
        if ($dateFrom) $baseQuery->whereDate('created_at', '>=', $dateFrom);
        if ($dateTo) $baseQuery->whereDate('created_at', '<=', $dateTo);
        if ($search) {
            $baseQuery->where(function ($q) use ($search) {
                $q->where('entity_name', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%");
            });
        }

        $activityOverTime = (clone $baseQuery)
            ->where('created_at', '>=', now()->subDays(30))
            ->selectRaw('DATE(created_at) as date, COUNT(*) as count')
            ->groupBy('date')
            ->orderBy('date')
            ->pluck('count', 'date');

        $mostActiveUsers = (clone $baseQuery)
            ->select('user_id', DB::raw('COUNT(*) as count'))
            ->whereNotNull('user_id')
            ->groupBy('user_id')
            ->orderByDesc('count')
            ->limit(10)
            ->get()
            ->map(fn ($row) => [
                'user_id' => $row->user_id,
                'name'    => User::find($row->user_id)?->name ?? 'Deleted User',
                'count'   => $row->count,
            ]);

        $byEntityType = (clone $baseQuery)
            ->selectRaw('entity_type, COUNT(*) as count')
            ->groupBy('entity_type')
            ->pluck('count', 'entity_type');

        $byAction = (clone $baseQuery)
            ->selectRaw('action, COUNT(*) as count')
            ->groupBy('action')
            ->pluck('count', 'action');

        return Inertia::render('ActivityLog/Index', [
            'activities'    => $activities,
            'charts'        => [
                'activityOverTime' => $activityOverTime,
                'mostActiveUsers'  => $mostActiveUsers,
                'byEntityType'     => $byEntityType,
                'byAction'         => $byAction,
            ],
            'filters'       => [
                'user_id'     => $userId ?? '',
                'entity_type' => $entityType ?? '',
                'action'      => $action ?? '',
                'date_from'   => $dateFrom ?? '',
                'date_to'     => $dateTo ?? '',
                'search'      => $search ?? '',
            ],
            'filterOptions' => [
                'users'       => User::orderBy('name')->get(['id', 'name']),
                'entityTypes' => ['project', 'task', 'user', 'division', 'department', 'team', 'task_section'],
                'actions'     => ['created', 'updated', 'deleted'],
            ],
        ]);
    }
}
