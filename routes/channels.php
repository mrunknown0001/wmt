<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

Broadcast::channel('project.{projectId}', function ($user, $projectId) {
    $project = \App\Models\Project::find($projectId);

    return $project && $user->hasPermissionTo('view-projects');
});

Broadcast::channel('task.{taskId}', function ($user, $taskId) {
    $task = \App\Models\Task::find($taskId);

    return $task && $user->hasPermissionTo('view-tasks');
});
