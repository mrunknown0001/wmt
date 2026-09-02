<?php

use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\LogoutController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DashboardPreferenceController;
use App\Http\Controllers\DepartmentController;
use App\Http\Controllers\DivisionController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\ProjectViewPreferenceController;
use App\Http\Controllers\StandaloneTaskController;
use App\Http\Controllers\TaskController;
use App\Http\Controllers\TaskMinutesController;
use App\Http\Controllers\TaskDependencyController;
use App\Http\Controllers\TaskCommentController;
use App\Http\Controllers\MyTaskController;
use App\Http\Controllers\NoteController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\WorkloadController;
use App\Http\Controllers\NoteFolderController;
use App\Http\Controllers\NoteFolderShareController;
use App\Http\Controllers\NoteShareController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\CalendarController;
use App\Http\Controllers\ActivityLogController;
use App\Http\Controllers\AttachmentController;
use App\Http\Controllers\ExecutiveDashboardController;
use App\Http\Controllers\PasswordController;
use App\Http\Controllers\ProjectAutomationRuleController;
use App\Http\Controllers\ProjectChartController;
use App\Http\Controllers\ProjectMemberController;
use App\Http\Controllers\AiChatController;
use App\Http\Controllers\SearchController;
use App\Http\Controllers\SettingController;
use App\Http\Controllers\TaskSectionController;
use App\Http\Controllers\TeamController;
use App\Http\Controllers\CustomFieldController;
use App\Http\Controllers\ExportController;
use App\Http\Controllers\FolderController;
use App\Http\Controllers\FormController;
use App\Http\Controllers\PublicFormController;
use App\Http\Controllers\TaskCustomFieldValueController;
use App\Http\Controllers\LinkController;
use App\Http\Controllers\LinkGroupController;
use App\Http\Controllers\PeopleOptionsController;
use App\Http\Controllers\TrashController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\ApprovalProjectController;
use App\Http\Controllers\ApprovalCustomFieldController;
use App\Http\Controllers\ApprovalChainController;
use App\Http\Controllers\ApprovalItemController;
use App\Http\Controllers\ApprovalItemCommentController;
use App\Http\Controllers\ApprovalItemShareController;
use App\Http\Controllers\ApprovalFormController;
use App\Http\Controllers\PublicApprovalFormController;
use App\Http\Controllers\ApprovalAutomationRuleController;
use App\Http\Controllers\ApprovalDelegationController;
use App\Http\Controllers\MyPersonnelController;
use App\Http\Controllers\TaskDelegationController;
use App\Http\Controllers\MyApprovalsController;
use App\Http\Controllers\MyRequestsController;
use Illuminate\Support\Facades\Route;

// Guest routes
Route::middleware('guest')->group(function () {
    // Route::redirect rather than a closure: closures cannot be serialized, so
    // a closure here makes `php artisan route:cache` fail outright — which the
    // staging entrypoint runs under `set -e`, taking the container down with it.
    Route::redirect('/', '/login');

    Route::get('/login', [LoginController::class, 'create'])->name('login');
    Route::post('/login', [LoginController::class, 'store']);

});

// Public forms (no auth required)
Route::get('/forms/{uuid}', [PublicFormController::class, 'show'])->name('forms.show');
Route::post('/forms/{uuid}', [PublicFormController::class, 'submit'])->middleware('throttle:10,1')->name('forms.submit');

// Public approval forms (no auth required)
Route::get('/forms-approval/{uuid}', [PublicApprovalFormController::class, 'show'])->name('forms-approval.show');
Route::post('/forms-approval/{uuid}', [PublicApprovalFormController::class, 'submit'])->middleware('throttle:10,1')->name('forms-approval.submit');
Route::get('/forms-approval/{uuid}/success', [PublicApprovalFormController::class, 'success'])->name('forms-approval.success');

// Authenticated routes
Route::middleware('auth')->group(function () {
    Route::post('/logout', LogoutController::class)->name('logout');

    Route::get('/dashboard', DashboardController::class)->name('dashboard');
    Route::patch('/dashboard/preferences', [DashboardPreferenceController::class, 'update'])->name('dashboard.preferences.update');

    // How one person likes to look at one project — the task sort, for now.
    // Saved server-side rather than in the browser so it follows the person to
    // their other machine.
    Route::patch('/projects/{project}/view-preferences', [ProjectViewPreferenceController::class, 'update'])
        ->name('projects.view-preferences.update');

    // Global search
    Route::get('/api/search', SearchController::class)->name('search');
    // Options for the People custom-field picker (users + org units).
    Route::get('/api/people-options', PeopleOptionsController::class)->name('people-options');

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
    // Task dependencies: "this task waits on that one".
    Route::post('/tasks/{task}/dependencies', [TaskDependencyController::class, 'store'])->name('tasks.dependencies.store');
    Route::delete('/tasks/{task}/dependencies/{dependency}', [TaskDependencyController::class, 'destroy'])->name('tasks.dependencies.destroy');
    Route::patch('/tasks/{task}/patch', [StandaloneTaskController::class, 'patchField'])->name('tasks.patch');
    Route::get('/tasks/{task}/timeline', [StandaloneTaskController::class, 'timeline'])->name('tasks.timeline');

    // Minutes hang off the task itself: a meeting can be a standalone task or a
    // project one, and the record is the same either way.
    Route::put('/tasks/{task}/minutes', [TaskMinutesController::class, 'update'])->name('tasks.minutes.update');
    Route::post('/tasks/{task}/comments', [TaskCommentController::class, 'storeStandalone'])->name('standalone-tasks.comments.store');
    Route::put('/tasks/{task}/comments/{comment}', [TaskCommentController::class, 'updateStandalone'])->name('standalone-tasks.comments.update');
    Route::delete('/tasks/{task}/comments/{comment}', [TaskCommentController::class, 'destroyStandalone'])->name('standalone-tasks.comments.destroy');
    Route::get('/tasks/{task}/comments/{comment}/attachments/{attachment}/download', [TaskCommentController::class, 'downloadStandalone'])->name('standalone-tasks.comments.attachments.download');
    Route::get('/tasks/{task}/attachments/{attachment}/download', [StandaloneTaskController::class, 'downloadAttachment'])->name('standalone-tasks.attachments.download');

    // Attachment downloads. Every uploaded file is read through here so the
    // request is authorized against the task or approval request it belongs to
    // — see AttachmentController.
    Route::get('/attachments/task/{attachment}', [AttachmentController::class, 'task'])->name('attachments.task');
    Route::get('/attachments/task-comment/{attachment}', [AttachmentController::class, 'taskComment'])->name('attachments.task-comment');
    Route::get('/attachments/approval-item/{attachment}', [AttachmentController::class, 'approvalItem'])->name('attachments.approval-item');
    Route::get('/attachments/approval-comment/{attachment}', [AttachmentController::class, 'approvalItemComment'])->name('attachments.approval-comment');

    // Calendar
    Route::get('/calendar', [CalendarController::class, 'index'])->name('calendar');

    // User management (admin)
    // whereNumber keeps this from shadowing /users/create.
    Route::get('/users/{user}', [UserController::class, 'show'])->name('users.show')->whereNumber('user');
    // Admin only: a read-only view of everything a person can do — their roles,
    // every capability those roles grant, and the abilities derived from the org
    // chart and their project memberships.
    Route::get('/users/{user}/capabilities', [UserController::class, 'capabilities'])
        ->name('users.capabilities')->whereNumber('user')->middleware('role:admin');
    // Admin only: hand a departing person's unfinished work to somebody else.
    Route::post('/users/{user}/transfer-tasks', [UserController::class, 'transferTasks'])
        ->name('users.transfer-tasks')->whereNumber('user');
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
    Route::post('/projects/{project}/task-series/reset', [ProjectController::class, 'resetTaskSeries'])->name('projects.task-series.reset');
    Route::patch('/projects/{project}/toggle-pin', [ProjectController::class, 'togglePin'])->name('projects.toggle-pin');
    Route::post('/projects/reorder', [ProjectController::class, 'reorder'])->name('projects.reorder');
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

    // Approval Projects
    // Archived + Trash lists must be declared before the resource so they aren't captured by {approvalProject}
    Route::get('/approval-projects/archived', [ApprovalProjectController::class, 'archived'])->name('approval-projects.archived');
    Route::get('/approval-projects/trash', [ApprovalProjectController::class, 'trash'])->name('approval-projects.trash');
    Route::resource('approval-projects', ApprovalProjectController::class);
    Route::patch('/approval-projects/{approvalProject}/archive', [ApprovalProjectController::class, 'archive'])->name('approval-projects.archive');
    // Trash actions — withTrashed() so the binding resolves a soft-deleted project.
    Route::patch('/approval-projects/{approvalProject}/restore', [ApprovalProjectController::class, 'restore'])->withTrashed()->name('approval-projects.restore');
    Route::delete('/approval-projects/{approvalProject}/force', [ApprovalProjectController::class, 'forceDestroy'])->withTrashed()->name('approval-projects.force-destroy');
    Route::patch('/approval-projects/{approvalProject}/items/{item}/archive', [ApprovalItemController::class, 'archive'])->name('approval-projects.items.archive');
    Route::patch('/approval-projects/{approvalProject}/items/{item}/section', [ApprovalItemController::class, 'setSection'])->name('approval-projects.items.section');
    Route::get('/approval-projects/{approvalProject}/custom-fields', [ApprovalCustomFieldController::class, 'index'])->name('approval-projects.custom-fields.index');
    Route::post('/approval-projects/{approvalProject}/custom-fields', [ApprovalCustomFieldController::class, 'store'])->name('approval-projects.custom-fields.store');
    Route::put('/approval-projects/{approvalProject}/custom-fields/{customField}', [ApprovalCustomFieldController::class, 'update'])->name('approval-projects.custom-fields.update');
    Route::delete('/approval-projects/{approvalProject}/custom-fields/{customField}', [ApprovalCustomFieldController::class, 'destroy'])->name('approval-projects.custom-fields.destroy');
    Route::post('/approval-projects/{approvalProject}/custom-fields/reorder', [ApprovalCustomFieldController::class, 'reorder'])->name('approval-projects.custom-fields.reorder');

    // Approval Chains
    Route::get('/approval-projects/{approvalProject}/chains', [ApprovalChainController::class, 'index'])->name('approval-projects.chains.index');
    Route::get('/approval-projects/{approvalProject}/chains/create', [ApprovalChainController::class, 'create'])->name('approval-projects.chains.create');
    Route::post('/approval-projects/{approvalProject}/chains', [ApprovalChainController::class, 'store'])->name('approval-projects.chains.store');
    Route::get('/approval-projects/{approvalProject}/chains/{chain}', [ApprovalChainController::class, 'show'])->name('approval-projects.chains.show');
    Route::get('/approval-projects/{approvalProject}/chains/{chain}/edit', [ApprovalChainController::class, 'edit'])->name('approval-projects.chains.edit');
    Route::put('/approval-projects/{approvalProject}/chains/{chain}', [ApprovalChainController::class, 'update'])->name('approval-projects.chains.update');
    Route::delete('/approval-projects/{approvalProject}/chains/{chain}', [ApprovalChainController::class, 'destroy'])->name('approval-projects.chains.destroy');

    // Approval Items
    Route::get('/approval-projects/{approvalProject}/items', [ApprovalItemController::class, 'index'])->name('approval-projects.items.index');
    Route::get('/approval-projects/{approvalProject}/items/create', [ApprovalItemController::class, 'create'])->name('approval-projects.items.create');
    Route::post('/approval-projects/{approvalProject}/items', [ApprovalItemController::class, 'store'])->name('approval-projects.items.store');
    Route::get('/approval-projects/{approvalProject}/items/{item}', [ApprovalItemController::class, 'show'])->name('approval-projects.items.show');
    Route::get('/approval-projects/{approvalProject}/items/{item}/edit', [ApprovalItemController::class, 'edit'])->name('approval-projects.items.edit');
    Route::put('/approval-projects/{approvalProject}/items/{item}', [ApprovalItemController::class, 'update'])->name('approval-projects.items.update');
    Route::delete('/approval-projects/{approvalProject}/items/{item}', [ApprovalItemController::class, 'destroy'])->name('approval-projects.items.destroy');
    Route::post('/approval-projects/{approvalProject}/items/{item}/advance', [ApprovalItemController::class, 'advance'])->name('approval-projects.items.advance');
    Route::post('/approval-projects/{approvalProject}/items/{item}/resubmit', [ApprovalItemController::class, 'resubmit'])->name('approval-projects.items.resubmit');

    // Sharing a decided request with people who were not part of it.
    Route::post('/approval-projects/{approvalProject}/items/{item}/shares', [ApprovalItemShareController::class, 'store'])->name('approval-projects.items.shares.store');
    Route::delete('/approval-projects/{approvalProject}/items/{item}/shares/{user}', [ApprovalItemShareController::class, 'destroy'])->name('approval-projects.items.shares.destroy');

    // Approval Item Comments
    Route::post('/approval-projects/{approvalProject}/items/{item}/comments', [ApprovalItemCommentController::class, 'store'])->name('approval-projects.items.comments.store');
    Route::put('/approval-projects/{approvalProject}/items/{item}/comments/{comment}', [ApprovalItemCommentController::class, 'update'])->name('approval-projects.items.comments.update');
    Route::delete('/approval-projects/{approvalProject}/items/{item}/comments/{comment}', [ApprovalItemCommentController::class, 'destroy'])->name('approval-projects.items.comments.destroy');
    Route::get('/approval-projects/{approvalProject}/items/{item}/comments/{comment}/attachments/{attachment}/download', [ApprovalItemCommentController::class, 'download'])->name('approval-projects.items.comments.attachments.download');

    // Approval Forms
    Route::get('/approval-projects/{approvalProject}/forms', [ApprovalFormController::class, 'index'])->name('approval-projects.forms.index');
    Route::get('/approval-projects/{approvalProject}/forms/create', [ApprovalFormController::class, 'create'])->name('approval-projects.forms.create');
    Route::post('/approval-projects/{approvalProject}/forms', [ApprovalFormController::class, 'store'])->name('approval-projects.forms.store');
    Route::get('/approval-projects/{approvalProject}/forms/{form}', [ApprovalFormController::class, 'show'])->name('approval-projects.forms.show');
    Route::get('/approval-projects/{approvalProject}/forms/{form}/edit', [ApprovalFormController::class, 'edit'])->name('approval-projects.forms.edit');
    Route::put('/approval-projects/{approvalProject}/forms/{form}', [ApprovalFormController::class, 'update'])->name('approval-projects.forms.update');
    Route::delete('/approval-projects/{approvalProject}/forms/{form}', [ApprovalFormController::class, 'destroy'])->name('approval-projects.forms.destroy');
    Route::patch('/approval-projects/{approvalProject}/forms/{form}/toggle', [ApprovalFormController::class, 'toggle'])->name('approval-projects.forms.toggle');

    // Approval Automation Rules
    Route::get('/approval-projects/{approvalProject}/automation-rules', [ApprovalAutomationRuleController::class, 'index'])->name('approval-projects.automation-rules.index');
    Route::get('/approval-projects/{approvalProject}/automation-rules/create', [ApprovalAutomationRuleController::class, 'create'])->name('approval-projects.automation-rules.create');
    Route::post('/approval-projects/{approvalProject}/automation-rules', [ApprovalAutomationRuleController::class, 'store'])->name('approval-projects.automation-rules.store');
    Route::get('/approval-projects/{approvalProject}/automation-rules/{rule}/edit', [ApprovalAutomationRuleController::class, 'edit'])->name('approval-projects.automation-rules.edit');
    Route::put('/approval-projects/{approvalProject}/automation-rules/{rule}', [ApprovalAutomationRuleController::class, 'update'])->name('approval-projects.automation-rules.update');
    Route::delete('/approval-projects/{approvalProject}/automation-rules/{rule}', [ApprovalAutomationRuleController::class, 'destroy'])->name('approval-projects.automation-rules.destroy');
    Route::patch('/approval-projects/{approvalProject}/automation-rules/{rule}/toggle', [ApprovalAutomationRuleController::class, 'toggle'])->name('approval-projects.automation-rules.toggle');

    // My Approvals (Approver Inbox)
    Route::get('/my-approvals', [MyApprovalsController::class, 'index'])->name('my-approvals.index');

    // Cover for approvers who are away.
    Route::get('/approval-delegations', [ApprovalDelegationController::class, 'index'])->name('approval-delegations.index');
    Route::post('/approval-delegations', [ApprovalDelegationController::class, 'store'])->name('approval-delegations.store');
    Route::delete('/approval-delegations/{approvalDelegation}', [ApprovalDelegationController::class, 'destroy'])->name('approval-delegations.destroy');
    Route::get('/my-requests', [MyRequestsController::class, 'index'])->name('my-requests.index');

    // The people a head or leader oversees, arranged as the org chart is.
    Route::get('/my-personnel', [MyPersonnelController::class, 'index'])->name('my-personnel.index');
    Route::get('/my-personnel/overdue', [MyPersonnelController::class, 'overdue'])->name('my-personnel.overdue');

    // Cover for people who are away — their tasks move to a stand-in and come
    // back on their own when the period ends.
    Route::get('/task-delegations', [TaskDelegationController::class, 'index'])->name('task-delegations.index');
    Route::post('/task-delegations', [TaskDelegationController::class, 'store'])->name('task-delegations.store');
    // Cover for one task rather than a person's whole workload — arranged from
    // the User Overview page.
    Route::post('/task-delegations/task', [TaskDelegationController::class, 'storeTask'])->name('task-delegations.store-task');
    Route::post('/task-delegations/{taskDelegation}/end', [TaskDelegationController::class, 'end'])->name('task-delegations.end');
    Route::delete('/task-delegations/{taskDelegation}', [TaskDelegationController::class, 'destroy'])->name('task-delegations.destroy');

    // Folders
    Route::post('/folders', [FolderController::class, 'store'])->name('folders.store');
    Route::patch('/folders/{folder}', [FolderController::class, 'update'])->name('folders.update');
    Route::patch('/folders/{folder}/move', [FolderController::class, 'move'])->name('folders.move');
    Route::delete('/folders/{folder}', [FolderController::class, 'destroy'])->name('folders.destroy');
    Route::patch('/projects/{project}/folder', [ProjectController::class, 'moveToFolder'])->name('projects.folder');

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
    Route::get('/executive-dashboard/tasks', [ExecutiveDashboardController::class, 'tasks'])->name('executive-dashboard.tasks');
    Route::get('/executive-dashboard/projects', [ExecutiveDashboardController::class, 'projects'])->name('executive-dashboard.projects');
    Route::get('/executive-dashboard/divisions/{division}', [ExecutiveDashboardController::class, 'division'])->name('executive-dashboard.division');
    Route::get('/executive-dashboard/departments/{department}', [ExecutiveDashboardController::class, 'department'])->name('executive-dashboard.department');
    Route::get('/executive-dashboard/teams/{team}', [ExecutiveDashboardController::class, 'team'])->name('executive-dashboard.team');

    // Activity Log (admin)
    Route::get('/activity-log', [ActivityLogController::class, 'index'])->name('activity-log');

    // Trash Bin (admin)
    Route::get('/trash', [TrashController::class, 'index'])->name('trash.index');
    // Before the {type}/{id} routes so "bulk" is never read as a type.
    Route::post('/trash/bulk/restore', [TrashController::class, 'bulkRestore'])->name('trash.bulk-restore');
    Route::post('/trash/bulk/force-delete', [TrashController::class, 'bulkForceDelete'])->name('trash.bulk-destroy');
    Route::post('/trash/{type}/{id}/restore', [TrashController::class, 'restore'])->name('trash.restore');
    Route::delete('/trash/{type}/{id}', [TrashController::class, 'forceDelete'])->name('trash.destroy');

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

    // Project Dashboard Charts
    Route::post('/projects/{project}/charts', [ProjectChartController::class, 'store'])->name('projects.charts.store');
    Route::put('/projects/{project}/charts/{chart}', [ProjectChartController::class, 'update'])->name('projects.charts.update');
    Route::delete('/projects/{project}/charts/{chart}', [ProjectChartController::class, 'destroy'])->name('projects.charts.destroy');

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
    // Link groups must be declared before the resource route so /links/groups
    // isn't swallowed by links/{link}.
    Route::get('/links/groups', [LinkGroupController::class, 'index'])->name('link-groups.index');
    Route::post('/links/groups', [LinkGroupController::class, 'store'])->name('link-groups.store');
    Route::put('/links/groups/{linkGroup}', [LinkGroupController::class, 'update'])->name('link-groups.update');
    Route::delete('/links/groups/{linkGroup}', [LinkGroupController::class, 'destroy'])->name('link-groups.destroy');
    Route::resource('links', LinkController::class)->except(['show']);

    // Notes. The static routes come before notes/{note} so "folders" and
    // "share-options" aren't captured as a note id.
    Route::get('/notes/share-options', [NoteController::class, 'shareOptions'])->name('notes.share-options');
    Route::post('/notes/folders', [NoteFolderController::class, 'store'])->name('note-folders.store');
    Route::put('/notes/folders/{noteFolder}', [NoteFolderController::class, 'update'])->name('note-folders.update');
    Route::delete('/notes/folders/{noteFolder}', [NoteFolderController::class, 'destroy'])->name('note-folders.destroy');
    Route::post('/notes/folders/{noteFolder}/shares', [NoteFolderShareController::class, 'store'])->name('note-folders.shares.store');
    Route::put('/notes/folders/{noteFolder}/shares/{share}', [NoteFolderShareController::class, 'update'])->name('note-folders.shares.update');
    Route::delete('/notes/folders/{noteFolder}/shares/{share}', [NoteFolderShareController::class, 'destroy'])->name('note-folders.shares.destroy');

    Route::resource('notes', NoteController::class);
    Route::post('/notes/{note}/autosave', [NoteController::class, 'autosave'])->name('notes.autosave');
    Route::post('/notes/{note}/archive', [NoteController::class, 'archive'])->name('notes.archive');
    Route::post('/notes/{note}/unarchive', [NoteController::class, 'unarchive'])->name('notes.unarchive');
    Route::post('/notes/{note}/shares', [NoteShareController::class, 'store'])->name('notes.shares.store');
    Route::put('/notes/{note}/shares/{share}', [NoteShareController::class, 'update'])->name('notes.shares.update');
    Route::delete('/notes/{note}/shares/{share}', [NoteShareController::class, 'destroy'])->name('notes.shares.destroy');

    // Reports shows the whole organisation's numbers, so it stays admin-only.
    // Gated by permission rather than role name so the access can be granted
    // from the roles table without a deploy.
    Route::get('/reports', [ReportController::class, 'index'])
        ->middleware('can:view-reports')->name('reports.index');

    // Workload has two doors: view-workload for the whole organisation, or
    // heading a division or department for that branch. That is more than a
    // permission string can say, so the controller authorises it — the same
    // arrangement My Personnel uses for the same reason.
    Route::get('/workload', [WorkloadController::class, 'index'])->name('workload.index');

    // What one cell on that grid is made of. Same gate as the page, and the
    // same scope: a drill-down must not reach past what the grid shows.
    Route::get('/workload/breakdown', [WorkloadController::class, 'breakdown'])
        ->name('workload.breakdown');

    // Organization structure — admin-only. Managing divisions, departments and
    // teams is an administrator's job; the role gate here matches the sidebar,
    // which shows these links to admins alone, and covers every action on the
    // resource (store/update authorize in their form requests, not the
    // controller, so a route-level gate is the one place that catches them all).
    Route::middleware('role:admin')->group(function () {
        Route::resource('divisions', DivisionController::class)->except(['show']);
        Route::resource('departments', DepartmentController::class)->except(['show']);
        Route::resource('teams', TeamController::class)->except(['show']);
    });
});
