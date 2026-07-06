<?php

namespace Tests\Feature\Api;

use App\Models\ActivityLog;
use App\Models\Project;
use App\Models\ProjectAutomationRule;
use App\Models\Setting;
use App\Models\Task;
use App\Models\TaskActivity;
use App\Models\TaskComment;
use App\Models\TaskSection;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class MobileApiTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $regularUser;
    private string $adminToken;
    private string $userToken;

    protected function setUp(): void
    {
        parent::setUp();

        // Seed roles and permissions
        app(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();

        foreach (['manage-users', 'view-users', 'manage-roles', 'manage-divisions', 'view-divisions', 'manage-departments', 'view-departments', 'manage-teams', 'view-teams', 'manage-projects', 'view-projects', 'manage-tasks', 'view-tasks'] as $perm) {
            Permission::firstOrCreate(['name' => $perm]);
        }

        $adminRole = Role::firstOrCreate(['name' => 'admin']);
        $adminRole->syncPermissions(Permission::all());

        $userRole = Role::firstOrCreate(['name' => 'user']);
        $userRole->syncPermissions(['view-projects', 'view-tasks']);

        Role::firstOrCreate(['name' => 'executive']);
        Role::firstOrCreate(['name' => 'supervisor']);
        Role::firstOrCreate(['name' => 'division_head']);

        $this->admin = User::factory()->create();
        $this->admin->assignRole('admin');
        $this->adminToken = $this->admin->createToken('test')->plainTextToken;

        $this->regularUser = User::factory()->create();
        $this->regularUser->assignRole('user');
        $this->userToken = $this->regularUser->createToken('test')->plainTextToken;
    }

    // ──────────────────────────────────────────────
    // 1. Notification Preferences
    // ──────────────────────────────────────────────

    public function test_notification_preferences_requires_auth(): void
    {
        $this->getJson('/api/notification-preferences')
            ->assertUnauthorized();
    }

    public function test_get_notification_preferences(): void
    {
        $response = $this->withToken($this->userToken)
            ->getJson('/api/notification-preferences');

        $response->assertOk()
            ->assertJsonStructure([
                'email_task_assigned',
                'email_task_due_soon',
                'email_task_due_reminder',
                'email_task_overdue',
                'email_task_comment',
                'email_task_mention',
                'email_comment_deleted',
                'email_task_escalated',
            ]);

        // Defaults: all true except comment_deleted
        $this->assertTrue($response->json('email_task_assigned'));
        $this->assertFalse($response->json('email_comment_deleted'));
    }

    public function test_update_notification_preference(): void
    {
        $response = $this->withToken($this->userToken)
            ->postJson('/api/notification-preferences', [
                'type' => 'email_task_assigned',
                'enabled' => false,
            ]);

        $response->assertOk()
            ->assertJson(['message' => 'Notification preference updated.']);

        // Verify it was persisted
        $prefs = $this->withToken($this->userToken)
            ->getJson('/api/notification-preferences');
        $this->assertFalse($prefs->json('email_task_assigned'));
    }

    public function test_update_notification_preference_validates_type(): void
    {
        $this->withToken($this->userToken)
            ->postJson('/api/notification-preferences', [
                'type' => 'invalid_key',
                'enabled' => true,
            ])
            ->assertUnprocessable();
    }

    // ──────────────────────────────────────────────
    // 3. Global Search
    // ──────────────────────────────────────────────

    public function test_mobile_search_requires_auth(): void
    {
        $this->getJson('/api/mobile/search?q=test')
            ->assertUnauthorized();
    }

    public function test_mobile_search_returns_results(): void
    {
        $project = Project::factory()->create(['name' => 'Test Project Alpha']);
        Task::factory()->create([
            'project_id' => $project->id,
            'title' => 'Alpha Task',
            'status' => 'to_do',
            'priority' => 'high',
        ]);

        $response = $this->withToken($this->userToken)
            ->getJson('/api/mobile/search?q=Alpha');

        $response->assertOk()
            ->assertJsonStructure([
                'projects' => [['id', 'name', 'status']],
                'tasks' => [['id', 'title', 'project_id', 'project_name', 'status', 'priority', 'due_date']],
            ]);
    }

    public function test_mobile_search_short_query_returns_empty(): void
    {
        $this->withToken($this->userToken)
            ->getJson('/api/mobile/search?q=a')
            ->assertOk()
            ->assertJson(['projects' => [], 'tasks' => []]);
    }

    // ──────────────────────────────────────────────
    // 4. App Settings
    // ──────────────────────────────────────────────

    public function test_settings_requires_auth(): void
    {
        $this->getJson('/api/settings')
            ->assertUnauthorized();
    }

    public function test_get_settings(): void
    {
        Setting::firstOrCreate([], [
            'app_name' => 'WMT',
            'primary_color' => 'blue',
            'max_upload_size' => 10,
        ]);
        Setting::clearCache();

        $response = $this->withToken($this->userToken)
            ->getJson('/api/settings');

        $response->assertOk()
            ->assertJsonStructure(['app_name', 'primary_color', 'max_upload_size', 'video_max_upload_size'])
            ->assertJson(['video_max_upload_size' => 50]);
    }

    // ──────────────────────────────────────────────
    // 5. Comment/Activity Pagination
    // ──────────────────────────────────────────────

    public function test_comments_pagination_requires_auth(): void
    {
        $project = Project::factory()->create();
        $task = Task::factory()->create(['project_id' => $project->id]);

        $this->getJson("/api/projects/{$project->id}/tasks/{$task->id}/comments")
            ->assertUnauthorized();
    }

    public function test_comments_pagination(): void
    {
        $project = Project::factory()->create(['owner_id' => $this->admin->id]);
        $task = Task::factory()->create(['project_id' => $project->id]);

        // Create 25 comments
        for ($i = 0; $i < 25; $i++) {
            $task->comments()->create([
                'user_id' => $this->admin->id,
                'body' => "Comment {$i}",
            ]);
        }

        $response = $this->withToken($this->adminToken)
            ->getJson("/api/projects/{$project->id}/tasks/{$task->id}/comments?limit=10");

        $response->assertOk()
            ->assertJsonStructure(['comments', 'has_more'])
            ->assertJson(['has_more' => true]);

        $this->assertCount(10, $response->json('comments'));

        // Load next page using before_id
        $lastId = collect($response->json('comments'))->last()['id'];
        $page2 = $this->withToken($this->adminToken)
            ->getJson("/api/projects/{$project->id}/tasks/{$task->id}/comments?limit=10&before_id={$lastId}");

        $page2->assertOk();
        $this->assertCount(10, $page2->json('comments'));
    }

    public function test_activities_pagination(): void
    {
        $project = Project::factory()->create(['owner_id' => $this->admin->id]);
        $task = Task::factory()->create(['project_id' => $project->id]);

        // Create 25 activities
        for ($i = 0; $i < 25; $i++) {
            TaskActivity::create([
                'task_id' => $task->id,
                'user_id' => $this->admin->id,
                'field' => 'status',
                'old_value' => 'to_do',
                'new_value' => 'in_progress',
                'description' => "Changed status {$i}",
            ]);
        }

        $response = $this->withToken($this->adminToken)
            ->getJson("/api/projects/{$project->id}/tasks/{$task->id}/activities?limit=10");

        $response->assertOk()
            ->assertJsonStructure(['activities', 'has_more'])
            ->assertJson(['has_more' => true]);

        $this->assertCount(10, $response->json('activities'));
    }

    // ──────────────────────────────────────────────
    // 6. Task Sections CRUD
    // ──────────────────────────────────────────────

    public function test_section_create_requires_auth(): void
    {
        $project = Project::factory()->create();

        $this->postJson("/api/projects/{$project->id}/sections", ['name' => 'Test'])
            ->assertUnauthorized();
    }

    public function test_section_crud(): void
    {
        $project = Project::factory()->create(['owner_id' => $this->admin->id]);

        // Create
        $response = $this->withToken($this->adminToken)
            ->postJson("/api/projects/{$project->id}/sections", ['name' => 'Backlog']);

        $response->assertCreated()
            ->assertJsonPath('section.name', 'Backlog');

        $sectionId = $response->json('section.id');

        // Update
        $this->withToken($this->adminToken)
            ->putJson("/api/projects/{$project->id}/sections/{$sectionId}", ['name' => 'Sprint 1'])
            ->assertOk()
            ->assertJsonPath('section.name', 'Sprint 1');

        // Delete
        $this->withToken($this->adminToken)
            ->deleteJson("/api/projects/{$project->id}/sections/{$sectionId}")
            ->assertNoContent();
    }

    public function test_section_create_forbidden_for_non_owner(): void
    {
        $project = Project::factory()->create(); // owned by someone else

        $this->withToken($this->userToken)
            ->postJson("/api/projects/{$project->id}/sections", ['name' => 'Test'])
            ->assertForbidden();
    }

    public function test_section_reorder(): void
    {
        $project = Project::factory()->create(['owner_id' => $this->admin->id]);
        $s1 = $project->sections()->create(['name' => 'A', 'position' => 0]);
        $s2 = $project->sections()->create(['name' => 'B', 'position' => 1]);

        $this->withToken($this->adminToken)
            ->postJson("/api/projects/{$project->id}/sections/reorder", [
                'ordered_ids' => [$s2->id, $s1->id],
            ])
            ->assertOk()
            ->assertJson(['success' => true]);

        $this->assertEquals(1, $s1->fresh()->position);
        $this->assertEquals(0, $s2->fresh()->position);
    }

    // ──────────────────────────────────────────────
    // 7. Activity Log
    // ──────────────────────────────────────────────

    public function test_activity_log_requires_auth(): void
    {
        $this->getJson('/api/activity-log')
            ->assertUnauthorized();
    }

    public function test_activity_log_requires_admin(): void
    {
        $this->withToken($this->userToken)
            ->getJson('/api/activity-log')
            ->assertForbidden();
    }

    public function test_activity_log_returns_paginated(): void
    {
        ActivityLog::create([
            'user_id' => $this->admin->id,
            'entity_type' => 'project',
            'entity_id' => 1,
            'entity_name' => 'Test Project',
            'action' => 'created',
            'description' => 'Created project',
        ]);

        $response = $this->withToken($this->adminToken)
            ->getJson('/api/activity-log');

        $response->assertOk()
            ->assertJsonStructure(['data', 'current_page', 'last_page']);
    }

    // ──────────────────────────────────────────────
    // 8. Executive Dashboard
    // ──────────────────────────────────────────────

    public function test_executive_dashboard_requires_auth(): void
    {
        $this->getJson('/api/executive-dashboard')
            ->assertUnauthorized();
    }

    public function test_executive_dashboard_forbidden_for_regular_user(): void
    {
        $this->withToken($this->userToken)
            ->getJson('/api/executive-dashboard')
            ->assertForbidden();
    }

    public function test_executive_dashboard_accessible_by_admin(): void
    {
        $response = $this->withToken($this->adminToken)
            ->getJson('/api/executive-dashboard');

        $response->assertOk()
            ->assertJsonStructure([
                'level',
                'metrics' => ['totalTasks', 'completedTasks', 'overdueTasks', 'activeProjects', 'totalProjects', 'completionRate'],
                'divisions',
                'activity_trend',
                'top_contributors',
                'at_risk_items',
            ])
            ->assertJson(['level' => 'overview']);
    }

    // ──────────────────────────────────────────────
    // 9. Automation Rules
    // ──────────────────────────────────────────────

    public function test_automation_rules_requires_auth(): void
    {
        $project = Project::factory()->create();

        $this->getJson("/api/projects/{$project->id}/automation-rules")
            ->assertUnauthorized();
    }

    public function test_automation_rules_forbidden_for_non_owner(): void
    {
        $project = Project::factory()->create();

        $this->withToken($this->userToken)
            ->getJson("/api/projects/{$project->id}/automation-rules")
            ->assertForbidden();
    }

    public function test_automation_rules_returns_rules(): void
    {
        $project = Project::factory()->create(['owner_id' => $this->admin->id]);

        ProjectAutomationRule::create([
            'project_id' => $project->id,
            'name' => 'Auto-assign',
            'trigger_type' => 'task_created',
            'conditions' => [],
            'actions' => [['type' => 'assign_user', 'params' => ['user_id' => 1]]],
            'is_active' => true,
            'created_by' => $this->admin->id,
        ]);

        $response = $this->withToken($this->adminToken)
            ->getJson("/api/projects/{$project->id}/automation-rules");

        $response->assertOk()
            ->assertJsonStructure(['rules' => [['id', 'name', 'trigger', 'conditions', 'actions', 'is_active']]]);
    }

    // ──────────────────────────────────────────────
    // 10. Calendar Feed
    // ──────────────────────────────────────────────

    public function test_calendar_requires_auth(): void
    {
        $this->getJson('/api/calendar?month=2026-07')
            ->assertUnauthorized();
    }

    public function test_calendar_returns_tasks(): void
    {
        $project = Project::factory()->create();
        Task::factory()->create([
            'project_id' => $project->id,
            'assigned_to' => $this->regularUser->id,
            'due_date' => '2026-07-15',
            'status' => 'to_do',
        ]);

        $response = $this->withToken($this->userToken)
            ->getJson('/api/calendar?month=2026-07');

        $response->assertOk()
            ->assertJsonStructure(['tasks']);

        $this->assertCount(1, $response->json('tasks'));
    }

    public function test_calendar_validates_month_format(): void
    {
        $this->withToken($this->userToken)
            ->getJson('/api/calendar?month=invalid')
            ->assertUnprocessable();
    }
}
