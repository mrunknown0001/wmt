<?php

use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\LogoutController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DashboardPreferenceController;
use App\Http\Controllers\DepartmentController;
use App\Http\Controllers\DivisionController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\TaskController;
use App\Http\Controllers\TaskCommentController;
use App\Http\Controllers\MyTaskController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\CalendarController;
use App\Http\Controllers\ActivityLogController;
use App\Http\Controllers\ExecutiveDashboardController;
use App\Http\Controllers\NotificationPreferenceController;
use App\Http\Controllers\PasswordController;
use App\Http\Controllers\ProjectAutomationRuleController;
use App\Http\Controllers\AiChatController;
use App\Http\Controllers\SearchController;
use App\Http\Controllers\SettingController;
use App\Http\Controllers\TaskSectionController;
use App\Http\Controllers\TeamController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

// Guest routes
Route::middleware('guest')->group(function () {
    Route::get('/', function () {
        return redirect()->route('login');
    });

    Route::get('/login', [LoginController::class, 'create'])->name('login');
    Route::post('/login', [LoginController::class, 'store']);

});

// Authenticated routes
Route::middleware('auth')->group(function () {
    Route::post('/logout', LogoutController::class)->name('logout');

    Route::get('/dashboard', DashboardController::class)->name('dashboard');
    Route::patch('/dashboard/preferences', [DashboardPreferenceController::class, 'update'])->name('dashboard.preferences.update');

    // Global search
    Route::get('/api/search', SearchController::class)->name('search');

    // Device tokens (FCM web push)
    Route::post('/api/device-tokens', [\App\Http\Controllers\Api\DeviceTokenController::class, 'store'])->name('device-tokens.store');
    Route::delete('/api/device-tokens', [\App\Http\Controllers\Api\DeviceTokenController::class, 'destroy'])->name('device-tokens.destroy');

    // Inbox (Notifications)
    Route::get('/inbox', [NotificationController::class, 'index'])->name('inbox');
    Route::get('/api/notifications/recent', [NotificationController::class, 'recent'])->name('notifications.recent');
    Route::patch('/inbox/{id}/read', [NotificationController::class, 'markAsRead'])->name('inbox.read');
    Route::post('/inbox/read-all', [NotificationController::class, 'markAllAsRead'])->name('inbox.readAll');

    // My Tasks
    Route::get('/my-tasks', [MyTaskController::class, 'index'])->name('my-tasks');

    // Calendar
    Route::get('/calendar', [CalendarController::class, 'index'])->name('calendar');

    // User management (admin)
    Route::resource('users', UserController::class)->except(['show']);

    // Projects & Tasks
    Route::get('/projects/archived', [ProjectController::class, 'archived'])->name('projects.archived');
    Route::resource('projects', ProjectController::class);
    Route::resource('projects.tasks', TaskController::class)
        ->except(['index', 'show'])
        ->scoped();
    Route::patch('/projects/{project}/archive', [ProjectController::class, 'archive'])->name('projects.archive');
    Route::post('/projects/{project}/tasks/reorder', [TaskController::class, 'reorder'])->name('projects.tasks.reorder');
    Route::post('/projects/{project}/tasks/bulk', [TaskController::class, 'bulkAction'])->name('projects.tasks.bulk');
    Route::patch('/projects/{project}/tasks/{task}/patch', [TaskController::class, 'patchField'])->name('projects.tasks.patch');
    Route::get('/projects/{project}/tasks/{task}/timeline', [TaskController::class, 'timeline'])->name('projects.tasks.timeline');
    Route::post('/projects/{project}/tasks/{task}/comments', [TaskCommentController::class, 'store'])->name('tasks.comments.store');
    Route::delete('/projects/{project}/tasks/{task}/comments/{comment}', [TaskCommentController::class, 'destroy'])->name('tasks.comments.destroy');

    // Task Sections
    Route::post('/projects/{project}/sections', [TaskSectionController::class, 'store'])->name('projects.sections.store');
    Route::patch('/projects/{project}/sections/{section}', [TaskSectionController::class, 'update'])->name('projects.sections.update');
    Route::delete('/projects/{project}/sections/{section}', [TaskSectionController::class, 'destroy'])->name('projects.sections.destroy');
    Route::post('/projects/{project}/sections/reorder', [TaskSectionController::class, 'reorder'])->name('projects.sections.reorder');

    // Executive Dashboard (admin + executive)
    Route::get('/executive-dashboard', [ExecutiveDashboardController::class, 'index'])->name('executive-dashboard');
    Route::get('/executive-dashboard/divisions/{division}', [ExecutiveDashboardController::class, 'division'])->name('executive-dashboard.division');
    Route::get('/executive-dashboard/departments/{department}', [ExecutiveDashboardController::class, 'department'])->name('executive-dashboard.department');
    Route::get('/executive-dashboard/teams/{team}', [ExecutiveDashboardController::class, 'team'])->name('executive-dashboard.team');

    // Activity Log (admin)
    Route::get('/activity-log', [ActivityLogController::class, 'index'])->name('activity-log');

    // Notification Preferences
    Route::get('/settings/notifications', [NotificationPreferenceController::class, 'edit'])->name('settings.notifications');
    Route::put('/settings/notifications', [NotificationPreferenceController::class, 'update'])->name('settings.notifications.update');

    // Change Password
    Route::get('/settings/password', [PasswordController::class, 'edit'])->name('settings.password');
    Route::put('/settings/password', [PasswordController::class, 'update'])->name('settings.password.update');
    Route::post('/settings/logout-other-devices', [PasswordController::class, 'logoutOtherDevices'])->name('settings.logout-other-devices');

    // Settings (admin)
    Route::get('/settings', [SettingController::class, 'edit'])->name('settings.edit');
    Route::put('/settings', [SettingController::class, 'update'])->name('settings.update');

    // Project Automation Rules
    Route::get('/projects/{project}/automation-rules', [ProjectAutomationRuleController::class, 'index'])->name('projects.automation-rules.index');
    Route::post('/projects/{project}/automation-rules', [ProjectAutomationRuleController::class, 'store'])->name('projects.automation-rules.store');
    Route::put('/projects/{project}/automation-rules/{rule}', [ProjectAutomationRuleController::class, 'update'])->name('projects.automation-rules.update');
    Route::delete('/projects/{project}/automation-rules/{rule}', [ProjectAutomationRuleController::class, 'destroy'])->name('projects.automation-rules.destroy');
    Route::patch('/projects/{project}/automation-rules/{rule}/toggle', [ProjectAutomationRuleController::class, 'toggle'])->name('projects.automation-rules.toggle');

    // AI Chat
    Route::get('/api/ai/conversations', [AiChatController::class, 'index'])->name('ai.conversations.index');
    Route::post('/api/ai/conversations', [AiChatController::class, 'store'])->name('ai.conversations.store');
    Route::get('/api/ai/conversations/{conversation}', [AiChatController::class, 'show'])->name('ai.conversations.show');
    Route::delete('/api/ai/conversations/{conversation}', [AiChatController::class, 'destroy'])->name('ai.conversations.destroy');
    Route::post('/api/ai/conversations/{conversation}/messages', [AiChatController::class, 'sendMessage'])->name('ai.conversations.sendMessage');

    // Organization structure
    Route::resource('divisions', DivisionController::class)->except(['show']);
    Route::resource('departments', DepartmentController::class)->except(['show']);
    Route::resource('teams', TeamController::class)->except(['show']);
});
