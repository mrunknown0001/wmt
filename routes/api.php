<?php

use App\Http\Controllers\Api\ActivityLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AutomationRuleController;
use App\Http\Controllers\Api\CalendarController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DeviceTokenController;
use App\Http\Controllers\Api\ExecutiveDashboardController;
use App\Http\Controllers\Api\MyTaskController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\NotificationPreferenceController;
use App\Http\Controllers\Api\PersonalTodoController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\SearchController;
use App\Http\Controllers\Api\SettingController;
use App\Http\Controllers\Api\StandaloneTaskController;
use App\Http\Controllers\Api\TaskCommentController;
use App\Http\Controllers\Api\TaskCommentPaginationController;
use App\Http\Controllers\Api\TaskController;
use App\Http\Controllers\Api\TaskSectionController;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Route;

Broadcast::routes(['prefix' => 'api', 'middleware' => ['auth:sanctum']]);

// Public
Route::get('/health', fn () => response()->json(['status' => 'ok', 'app' => config('app.name')]));
Route::post('/login', [AuthController::class, 'login']);

// Authenticated (Sanctum)
Route::middleware('auth:sanctum')->group(function () {
    // Auth
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);
    Route::put('/change-password', [AuthController::class, 'changePassword']);
    Route::post('/logout-other-devices', [AuthController::class, 'logoutOtherDevices']);

    // Dashboard
    Route::get('/dashboard', DashboardController::class);

    // My Tasks
    Route::get('/my-tasks', MyTaskController::class);

    // Projects
    Route::get('/projects', [ProjectController::class, 'index']);
    Route::post('/projects', [ProjectController::class, 'store']);
    Route::get('/projects/{project}', [ProjectController::class, 'show']);
    Route::put('/projects/{project}', [ProjectController::class, 'update']);
    Route::delete('/projects/{project}', [ProjectController::class, 'destroy']);

    // Standalone Tasks (no project)
    Route::post('/tasks', [StandaloneTaskController::class, 'store']);
    Route::get('/tasks/{task}', [StandaloneTaskController::class, 'show']);
    Route::put('/tasks/{task}', [StandaloneTaskController::class, 'update']);
    Route::delete('/tasks/{task}', [StandaloneTaskController::class, 'destroy']);
    Route::patch('/tasks/{task}/patch', [StandaloneTaskController::class, 'patchField']);
    Route::post('/tasks/{task}/comments', [StandaloneTaskController::class, 'storeComment']);
    Route::delete('/tasks/{task}/comments/{comment}', [StandaloneTaskController::class, 'destroyComment']);
    Route::get('/tasks/{task}/comments/{comment}/attachments/{attachment}/download', [StandaloneTaskController::class, 'downloadAttachment']);
    Route::get('/tasks/{task}/comments', [TaskCommentPaginationController::class, 'standaloneComments']);
    Route::get('/tasks/{task}/activities', [TaskCommentPaginationController::class, 'standaloneActivities']);

    // Tasks (project-scoped)
    Route::post('/projects/{project}/tasks', [TaskController::class, 'store']);
    Route::get('/projects/{project}/tasks/{task}', [TaskController::class, 'show']);
    Route::put('/projects/{project}/tasks/{task}', [TaskController::class, 'update']);
    Route::delete('/projects/{project}/tasks/{task}', [TaskController::class, 'destroy']);
    Route::patch('/projects/{project}/tasks/{task}/patch', [TaskController::class, 'patchField']);
    Route::post('/projects/{project}/tasks/{task}/comments', [TaskController::class, 'storeComment']);
    Route::delete('/projects/{project}/tasks/{task}/comments/{comment}', [TaskCommentController::class, 'destroy']);
    Route::get('/projects/{project}/tasks/{task}/comments/{comment}/attachments/{attachment}/download', [TaskCommentController::class, 'download']);

    // Notifications
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::patch('/notifications/{id}/read', [NotificationController::class, 'markAsRead']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllAsRead']);
    Route::patch('/notifications/{id}/bookmark', [NotificationController::class, 'toggleBookmark']);
    Route::patch('/notifications/{id}/archive', [NotificationController::class, 'archive']);
    Route::patch('/notifications/{id}/unarchive', [NotificationController::class, 'unarchive']);

    // Personal to-dos
    Route::get('/personal-todos', [PersonalTodoController::class, 'index']);
    Route::post('/personal-todos', [PersonalTodoController::class, 'store']);
    Route::patch('/personal-todos/{personalTodo}', [PersonalTodoController::class, 'update']);
    Route::delete('/personal-todos/{personalTodo}', [PersonalTodoController::class, 'destroy']);
    Route::post('/personal-todos/reorder', [PersonalTodoController::class, 'reorder']);
    Route::delete('/personal-todos/clear-completed', [PersonalTodoController::class, 'clearCompleted']);
    Route::delete('/personal-todos/clear-all', [PersonalTodoController::class, 'clearAll']);

    // Device tokens (FCM)
    Route::post('/device-tokens', [DeviceTokenController::class, 'store']);
    Route::delete('/device-tokens', [DeviceTokenController::class, 'destroy']);

    // Mobile app device-token registration (Bearer auth, distinct path to avoid the web /api/device-tokens CSRF route).
    Route::post('/mobile/device-tokens', [DeviceTokenController::class, 'store']);
    Route::delete('/mobile/device-tokens', [DeviceTokenController::class, 'destroy']);

    // Notification preferences
    Route::get('/notification-preferences', [NotificationPreferenceController::class, 'index']);
    Route::post('/notification-preferences', [NotificationPreferenceController::class, 'update']);

    // Global search (mobile path to avoid web.php /api/search shadow)
    Route::get('/mobile/search', SearchController::class);

    // App settings for clients
    Route::get('/settings', SettingController::class);

    // Comment & activity pagination
    Route::get('/projects/{project}/tasks/{task}/comments', [TaskCommentPaginationController::class, 'comments']);
    Route::get('/projects/{project}/tasks/{task}/activities', [TaskCommentPaginationController::class, 'activities']);

    // Task sections CRUD
    Route::post('/projects/{project}/sections', [TaskSectionController::class, 'store']);
    Route::put('/projects/{project}/sections/{section}', [TaskSectionController::class, 'update']);
    Route::delete('/projects/{project}/sections/{section}', [TaskSectionController::class, 'destroy']);
    Route::post('/projects/{project}/sections/reorder', [TaskSectionController::class, 'reorder']);

    // Activity log (admin)
    Route::get('/activity-log', ActivityLogController::class);

    // Executive dashboard (role-gated)
    Route::get('/executive-dashboard', ExecutiveDashboardController::class);

    // Automation rules (read-only)
    Route::get('/projects/{project}/automation-rules', AutomationRuleController::class);

    // Calendar feed
    Route::get('/calendar', CalendarController::class);
});
