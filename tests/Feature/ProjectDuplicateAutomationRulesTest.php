<?php

namespace Tests\Feature;

use App\Models\CustomField;
use App\Models\Project;
use App\Models\ProjectAutomationRule;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class ProjectDuplicateAutomationRulesTest extends TestCase
{
    use RefreshDatabase;

    private function makeAdmin(): User
    {
        foreach (['manage-projects', 'view-projects', 'manage-tasks', 'view-tasks'] as $perm) {
            Permission::findOrCreate($perm);
        }
        $role = Role::findOrCreate('admin');
        $role->givePermissionTo(['manage-projects', 'view-projects', 'manage-tasks', 'view-tasks']);

        $user = User::factory()->create(['is_active' => true]);
        $user->assignRole($role);

        return $user;
    }

    public function test_duplicate_copies_automation_rules_with_remapped_ids(): void
    {
        $admin = $this->makeAdmin();

        $project = Project::create([
            'name' => 'Source',
            'status' => 'active',
            'owner_id' => $admin->id,
        ]);

        $section = $project->sections()->create(['name' => 'Doing', 'position' => 0]);

        $field = $project->customFields()->create([
            'name' => 'Stage',
            'type' => 'single_select',
            'position' => 0,
        ]);
        $option = $field->options()->create(['label' => 'Won', 'position' => 0]);

        $rule = ProjectAutomationRule::create([
            'project_id' => $project->id,
            'name' => 'Move won deals',
            'is_active' => true,
            'trigger_type' => 'custom_field_changed',
            'trigger_config' => ['custom_field_id' => $field->id],
            'conditions' => [
                ['field' => 'custom_field', 'custom_field_id' => $field->id, 'operator' => 'equals', 'value' => $option->id],
                ['field' => 'section_id', 'operator' => 'equals', 'value' => (string) $section->id],
            ],
            'actions' => [
                ['type' => 'move_to_section', 'params' => ['section_id' => $section->id]],
                ['type' => 'set_custom_field', 'params' => ['custom_field_id' => $field->id, 'value' => $option->id]],
            ],
            'created_by' => $admin->id,
        ]);

        $response = $this->actingAs($admin)->postJson("/projects/{$project->id}/duplicate", [
            'include_tasks' => false,
            'copy_automation_rules' => true,
        ]);

        $response->assertOk()->assertJsonPath('success', true);

        $copy = Project::find($response->json('project.id'));
        $this->assertNotNull($copy);

        $copiedRules = $copy->automationRules()->get();
        $this->assertCount(1, $copiedRules);

        $copied = $copiedRules->first();
        $newField = $copy->customFields()->first();
        $newOption = $newField->options()->first();
        $newSection = $copy->sections()->first();

        $this->assertSame('Move won deals', $copied->name);
        $this->assertSame($newField->id, (int) $copied->trigger_config['custom_field_id']);
        $this->assertSame($newField->id, (int) $copied->conditions[0]['custom_field_id']);
        $this->assertSame($newOption->id, (int) $copied->conditions[0]['value']);
        $this->assertSame($newSection->id, (int) $copied->conditions[1]['value']);
        $this->assertSame($newSection->id, (int) $copied->actions[0]['params']['section_id']);
        $this->assertSame($newField->id, (int) $copied->actions[1]['params']['custom_field_id']);
        $this->assertSame($newOption->id, (int) $copied->actions[1]['params']['value']);

        // Original rule untouched
        $this->assertSame($field->id, (int) $rule->fresh()->trigger_config['custom_field_id']);
    }

    public function test_duplicate_skips_rules_when_option_disabled(): void
    {
        $admin = $this->makeAdmin();

        $project = Project::create([
            'name' => 'Source',
            'status' => 'active',
            'owner_id' => $admin->id,
        ]);

        ProjectAutomationRule::create([
            'project_id' => $project->id,
            'name' => 'Rule',
            'is_active' => true,
            'trigger_type' => 'task_created',
            'trigger_config' => null,
            'conditions' => [],
            'actions' => [['type' => 'change_priority', 'params' => ['priority' => 'high']]],
            'created_by' => $admin->id,
        ]);

        $response = $this->actingAs($admin)->postJson("/projects/{$project->id}/duplicate", [
            'include_tasks' => false,
            'copy_automation_rules' => false,
        ]);

        $response->assertOk();
        $copy = Project::find($response->json('project.id'));
        $this->assertSame(0, $copy->automationRules()->count());
    }
}
