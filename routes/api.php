<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DeviceTokenController;
use App\Http\Controllers\Api\MyTaskController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PersonalTodoController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\TaskCommentController;
use App\Http\Controllers\Api\StandaloneTaskController;
use App\Http\Controllers\Api\TaskController;
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

    // Personal to-dos
    Route::get('/personal-todos', [PersonalTodoController::class, 'index']);
    Route::post('/personal-todos', [PersonalTodoController::class, 'store']);
    Route::patch('/personal-todos/{personalTodo}', [PersonalTodoController::class, 'update']);
    Route::delete('/personal-todos/{personalTodo}', [PersonalTodoController::class, 'destroy']);
    Route::post('/personal-todos/reorder', [PersonalTodoController::class, 'reorder']);

    // Device tokens (FCM)
    Route::post('/device-tokens', [DeviceTokenController::class, 'store']);
    Route::delete('/device-tokens', [DeviceTokenController::class, 'destroy']);

    // Mobile app device-token registration (Bearer auth, distinct path to avoid the web /api/device-tokens CSRF route).
    Route::post('/mobile/device-tokens', [DeviceTokenController::class, 'store']);
    Route::delete('/mobile/device-tokens', [DeviceTokenController::class, 'destroy']);
});
