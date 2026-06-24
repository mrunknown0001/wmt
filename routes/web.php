<?php

use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\LogoutController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DepartmentController;
use App\Http\Controllers\DivisionController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\TaskController;
use App\Http\Controllers\TaskCommentController;
use App\Http\Controllers\MyTaskController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\SettingController;
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

    // Inbox (Notifications)
    Route::get('/inbox', [NotificationController::class, 'index'])->name('inbox');
    Route::patch('/inbox/{id}/read', [NotificationController::class, 'markAsRead'])->name('inbox.read');
    Route::post('/inbox/read-all', [NotificationController::class, 'markAllAsRead'])->name('inbox.readAll');

    // My Tasks
    Route::get('/my-tasks', [MyTaskController::class, 'index'])->name('my-tasks');

    // User management (admin)
    Route::resource('users', UserController::class)->except(['show']);

    // Projects & Tasks
    Route::resource('projects', ProjectController::class);
    Route::resource('projects.tasks', TaskController::class)
        ->except(['index', 'show'])
        ->scoped();
    Route::post('/projects/{project}/tasks/reorder', [TaskController::class, 'reorder'])->name('projects.tasks.reorder');
    Route::patch('/projects/{project}/tasks/{task}/patch', [TaskController::class, 'patchField'])->name('projects.tasks.patch');
    Route::get('/projects/{project}/tasks/{task}/timeline', [TaskController::class, 'timeline'])->name('projects.tasks.timeline');
    Route::post('/projects/{project}/tasks/{task}/comments', [TaskCommentController::class, 'store'])->name('tasks.comments.store');
    Route::delete('/projects/{project}/tasks/{task}/comments/{comment}', [TaskCommentController::class, 'destroy'])->name('tasks.comments.destroy');

    // Settings (admin)
    Route::get('/settings', [SettingController::class, 'edit'])->name('settings.edit');
    Route::put('/settings', [SettingController::class, 'update'])->name('settings.update');

    // Organization structure
    Route::resource('divisions', DivisionController::class)->except(['show']);
    Route::resource('departments', DepartmentController::class)->except(['show']);
    Route::resource('teams', TeamController::class)->except(['show']);
});
