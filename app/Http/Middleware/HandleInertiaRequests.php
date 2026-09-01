<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        return [
            ...parent::share($request),
            'ziggy' => fn () => [
                ...(new \Tighten\Ziggy\Ziggy)->toArray(),
                'location' => $request->url(),
            ],
            // Lazy: a plain array is evaluated on every request, including partial
            // reloads that filter this prop out. Inertia keeps previously-sent
            // props client-side, so deferring it costs nothing.
            'auth' => fn () => [
                'user' => $request->user() ? [
                    'id' => $request->user()->id,
                    'name' => $request->user()->name,
                    'email' => $request->user()->email,
                    'department' => $request->user()->department?->name,
                    'team' => $request->user()->team?->name,
                    'position' => $request->user()->position,
                    'roles' => $request->user()->getRoleNames(),
                    'permissions' => $request->user()->getAllPermissions()->pluck('name'),
                    'can_create_rules' => $request->user()->can_create_rules,
                    'can_approve' => $request->user()->can_approve,
                    'can_create_project' => $request->user()->canCreateProjects(),
                    'can_request' => $request->user()->can_request,
                    // Heads a division/department/team → can reach completion monitoring.
                    'is_org_head' => $request->user()->headsAnyOrgUnit(),
                    // Workload is wider than a permission: admins get the whole
                    // organisation, a division or department head gets their branch.
                    'can_view_workload' => $request->user()->canViewWorkload(),
                ] : null,
            ],
            'settings' => fn () => \App\Models\Setting::current(),
            'unreadNotificationsCount' => fn () => $request->user()?->unreadNotifications()->count() ?? 0,
            'pendingApprovalsCount' => fn () => $request->user()
                ? \App\Models\ApprovalStepInstance::where('status', 'active')
                    // Item must exist (excludes soft-deleted items) and its project
                    // must be live — archived or soft-deleted projects drop out, so
                    // their pending items stop counting toward the badge.
                    ->whereHas('item.approvalProject', fn ($q) => $q->where('status', '!=', 'archived'))
                    ->whereHas('approvers', fn ($q) => $q->where('user_id', $request->user()->id))
                    ->count()
                : 0,
            'personalTodosCount' => fn () => $request->user()?->personalTodos()->incomplete()->count() ?? 0,
            'flash' => [
                'success' => fn () => $request->session()->get('success'),
                'error' => fn () => $request->session()->get('error'),
            ],
        ];
    }
}
