<?php

use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\LogoutController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DashboardPreferenceController;
use App\Http\Controllers\DepartmentController;
use App\Http\Controllers\DivisionController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\StandaloneTaskController;
use App\Http\Controllers\TaskController;
use App\Http\Controllers\TaskCommentController;
use App\Http\Controllers\MyTaskController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\CalendarController;
use App\Http\Controllers\ActivityLogController;
use App\Http\Controllers\ExecutiveDashboardController;
use App\Http\Controllers\PasswordController;
use App\Http\Controllers\ProjectAutomationRuleController;
use App\Http\Controllers\ProjectMemberController;
use App\Http\Controllers\AiChatController;
use App\Http\Controllers\SearchController;
use App\Http\Controllers\SettingController;
use App\Http\Controllers\TaskSectionController;
use App\Http\Controllers\TeamController;
use App\Http\Controllers\CustomFieldController;
use App\Http\Controllers\ExportController;
use App\Http\Controllers\FormController;
use App\Http\Controllers\PublicFormController;
use App\Http\Controllers\TaskCustomFieldValueController;
use App\Http\Controllers\LinkController;
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

// Public forms (no auth required)
Route::get('/forms/{uuid}', [PublicFormController::class, 'show'])->name('forms.show');
Route::post('/forms/{uuid}', [PublicFormController::class, 'submit'])->middleware('throttle:10,1')->name('forms.submit');

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
    Route::patch('/inbox/{id}/bookmark', [NotificationController::class, 'toggleBookmark'])->name('inbox.bookmark');
    Route::patch('/inbox/{id}/archive', [NotificationController::class, 'archive'])->name('inbox.archive');
    Route::patch('/inbox/{id}/unarchive', [NotificationController::class, 'unarchive'])->name('inbox.unarchive');

    // My Tasks
    Route::get('/my-tasks', [MyTaskController::class, 'index'])->name('my-tasks');
    Route::get('/my-tasks/export', [ExportController::class, 'myTasks'])->name('my-tasks.export');

    // Standalone Tasks (not project-scoped)
    Route::post('/tasks', [StandaloneTaskController::class, 'store'])->name('tasks.store');
    Route::get('/tasks/{task}/edit', [StandaloneTaskController::class, 'edit'])->name('tasks.edit');
    Route::put('/tasks/{task}', [StandaloneTaskController::class, 'update'])->name('tasks.update');
    Route::delete('/tasks/{task}', [StandaloneTaskController::class, 'destroy'])->name('tasks.destroy');
    Route::patch('/tasks/{task}/patch', [StandaloneTaskController::class, 'patchField'])->name('tasks.patch');
    Route::get('/tasks/{task}/timeline', [StandaloneTaskController::class, 'timeline'])->name('tasks.timeline');
    Route::post('/tasks/{task}/comments', [TaskCommentController::class, 'storeStandalone'])->name('standalone-tasks.comments.store');
    Route::put('/tasks/{task}/comments/{comment}', [TaskCommentController::class, 'updateStandalone'])->name('standalone-tasks.comments.update');
    Route::delete('/tasks/{task}/comments/{comment}', [TaskCommentController::class, 'destroyStandalone'])->name('standalone-tasks.comments.destroy');
    Route::get('/tasks/{task}/comments/{comment}/attachments/{attachment}/download', [TaskCommentController::class, 'downloadStandalone'])->name('standalone-tasks.comments.attachments.download');
    Route::get('/tasks/{task}/attachments/{attachment}/download', [StandaloneTaskController::class, 'downloadAttachment'])->name('standalone-tasks.attachments.download');

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
    Route::get('/projects/{project}/export', [ExportController::class, 'projectTasks'])->name('projects.export');
    Route::patch('/projects/{project}/archive', [ProjectController::class, 'archive'])->name('projects.archive');
    Route::post('/projects/{project}/duplicate', [ProjectController::class, 'duplicate'])->name('projects.duplicate');
    Route::post('/projects/{project}/tasks/quick', [TaskController::class, 'quickStore'])->name('projects.tasks.quick');
    Route::post('/projects/{project}/tasks/reorder', [TaskController::class, 'reorder'])->name('projects.tasks.reorder');
    Route::post('/projects/{project}/tasks/bulk', [TaskController::class, 'bulkAction'])->name('projects.tasks.bulk');
    Route::post('/projects/{project}/tasks/{task}/duplicate', [TaskController::class, 'duplicate'])->name('projects.tasks.duplicate');
    Route::get('/projects/{project}/tasks/{task}/detail', [TaskController::class, 'show'])->name('projects.tasks.detail');
    Route::patch('/projects/{project}/tasks/{task}/patch', [TaskController::class, 'patchField'])->name('projects.tasks.patch');
    Route::get('/projects/{project}/tasks/{task}/timeline', [TaskController::class, 'timeline'])->name('projects.tasks.timeline');
    Route::post('/projects/{project}/tasks/{task}/comments', [TaskCommentController::class, 'store'])->name('tasks.comments.store');
    Route::put('/projects/{project}/tasks/{task}/comments/{comment}', [TaskCommentController::class, 'update'])->name('tasks.comments.update');
    Route::delete('/projects/{project}/tasks/{task}/comments/{comment}', [TaskCommentController::class, 'destroy'])->name('tasks.comments.destroy');
    Route::get('/projects/{project}/tasks/{task}/comments/{comment}/attachments/{attachment}/download', [TaskCommentController::class, 'download'])->name('tasks.comments.attachments.download');
    Route::get('/projects/{project}/tasks/{task}/attachments/{attachment}/download', [TaskController::class, 'downloadAttachment'])->name('tasks.attachments.download');

    // Project Members
    Route::post('/projects/{project}/members', [ProjectMemberController::class, 'store'])->name('projects.members.store');
    Route::put('/projects/{project}/members/{user}', [ProjectMemberController::class, 'update'])->name('projects.members.update');
    Route::delete('/projects/{project}/members/{user}', [ProjectMemberController::class, 'destroy'])->name('projects.members.destroy');

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

    // Change Password
    Route::get('/settings/password', [PasswordController::class, 'edit'])->name('settings.password');
    Route::put('/settings/password', [PasswordController::class, 'update'])->name('settings.password.update');
    Route::post('/settings/logout-other-devices', [PasswordController::class, 'logoutOtherDevices'])->name('settings.logout-other-devices');

    // Settings (admin)
    Route::get('/settings', [SettingController::class, 'edit'])->name('settings.edit');
    Route::put('/settings', [SettingController::class, 'update'])->name('settings.update');

    // Custom Fields
    Route::get('/projects/{project}/custom-fields', [CustomFieldController::class, 'index'])->name('projects.custom-fields.index');
    Route::post('/projects/{project}/custom-fields', [CustomFieldController::class, 'store'])->name('projects.custom-fields.store');
    Route::put('/projects/{project}/custom-fields/{customField}', [CustomFieldController::class, 'update'])->name('projects.custom-fields.update');
    Route::delete('/projects/{project}/custom-fields/{customField}', [CustomFieldController::class, 'destroy'])->name('projects.custom-fields.destroy');
    Route::post('/projects/{project}/custom-fields/reorder', [CustomFieldController::class, 'reorder'])->name('projects.custom-fields.reorder');

    // Task Custom Field Values
    Route::patch('/projects/{project}/tasks/{task}/custom-field-values', [TaskCustomFieldValueController::class, 'update'])->name('projects.tasks.custom-field-values.update');

    // Project Forms
    Route::get('/projects/{project}/forms', [FormController::class, 'index'])->name('projects.forms.index');
    Route::get('/projects/{project}/forms/create', [FormController::class, 'create'])->name('projects.forms.create');
    Route::post('/projects/{project}/forms', [FormController::class, 'store'])->name('projects.forms.store');
    Route::get('/projects/{project}/forms/{form}/edit', [FormController::class, 'edit'])->name('projects.forms.edit');
    Route::put('/projects/{project}/forms/{form}', [FormController::class, 'update'])->name('projects.forms.update');
    Route::delete('/projects/{project}/forms/{form}', [FormController::class, 'destroy'])->name('projects.forms.destroy');
    Route::patch('/projects/{project}/forms/{form}/toggle', [FormController::class, 'toggle'])->name('projects.forms.toggle');

    // Project Automation Rules
    Route::get('/projects/{project}/automation-rules', [ProjectAutomationRuleController::class, 'index'])->name('projects.automation-rules.index');
    Route::post('/projects/{project}/automation-rules', [ProjectAutomationRuleController::class, 'store'])->name('projects.automation-rules.store');
    Route::put('/projects/{project}/automation-rules/{rule}', [ProjectAutomationRuleController::class, 'update'])->name('projects.automation-rules.update');
    Route::delete('/projects/{project}/automation-rules/{rule}', [ProjectAutomationRuleController::class, 'destroy'])->name('projects.automation-rules.destroy');
    Route::patch('/projects/{project}/automation-rules/{rule}/toggle', [ProjectAutomationRuleController::class, 'toggle'])->name('projects.automation-rules.toggle');
    Route::post('/projects/{project}/automation-rules/{rule}/duplicate', [ProjectAutomationRuleController::class, 'duplicate'])->name('projects.automation-rules.duplicate');

    // AI Chat
    Route::get('/api/ai/conversations', [AiChatController::class, 'index'])->name('ai.conversations.index');
    Route::post('/api/ai/conversations', [AiChatController::class, 'store'])->name('ai.conversations.store');
    Route::get('/api/ai/conversations/{conversation}', [AiChatController::class, 'show'])->name('ai.conversations.show');
    Route::delete('/api/ai/conversations/{conversation}', [AiChatController::class, 'destroy'])->name('ai.conversations.destroy');
    Route::post('/api/ai/conversations/{conversation}/messages', [AiChatController::class, 'sendMessage'])->name('ai.conversations.sendMessage');

    // Links & URLs
    Route::resource('links', LinkController::class)->except(['show']);

    // Organization structure
    Route::resource('divisions', DivisionController::class)->except(['show']);
    Route::resource('departments', DepartmentController::class)->except(['show']);
    Route::resource('teams', TeamController::class)->except(['show']);
});
