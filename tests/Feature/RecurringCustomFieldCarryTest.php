<?php

namespace Tests\Feature;

use App\Models\CustomField;
use App\Models\CustomFieldOption;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskCustomFieldValue;
use App\Models\User;
use App\Services\RecurringTaskService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * What a regenerated recurring task carries forward.
 *
 * Reported as losing every single-select value while text and date survived —
 * which would be the signature of a copy that moves the scalar columns but not
 * value_option_id, the foreign key a single-select actually stores in.
 */
class RecurringCustomFieldCarryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function field(Project $project, string $name, string $type, array $config = []): CustomField
    {
        return CustomField::create([
            'project_id' => $project->id,
            'name' => $name,
            'type' => $type,
            'config' => $config,
            'position' => 0,
        ]);
    }

    public function test_a_regenerated_task_carries_every_field_type_including_single_select(): void
    {
        $actor = User::factory()->create();
        $project = Project::factory()->create();

        $shift = $this->field($project, 'Shift Type', 'single_select');
        $dayShift = CustomFieldOption::create(['custom_field_id' => $shift->id, 'label' => 'Day Shift', 'position' => 0]);
        CustomFieldOption::create(['custom_field_id' => $shift->id, 'label' => 'Night Shift', 'position' => 1]);

        $staff = $this->field($project, 'Assigned Staff', 'text');
        $duty  = $this->field($project, 'Duty Date', 'date');

        $task = Task::factory()->create([
            'project_id' => $project->id,
            'status' => 'in_progress',
            'is_recurring' => true,
            // The table carries these as columns alongside the JSON config.
            'recurrence_frequency' => 'daily',
            'recurrence_interval' => 1,
            'recurrence_config' => ['frequency' => 'daily', 'interval' => 1],
            'due_date' => now()->startOfDay(),
        ]);

        foreach ([[$shift, $dayShift->id], [$staff, 'Restly Morales'], [$duty, now()->toDateString()]] as [$field, $value]) {
            $cfv = new TaskCustomFieldValue(['task_id' => $task->id, 'custom_field_id' => $field->id]);
            $cfv->setTypedValue($field->type, $value);
            $cfv->save();
        }

        $task->status = 'done';
        $next = RecurringTaskService::generateNextIfCompleted($task, 'in_progress', $actor);

        $this->assertNotNull($next, 'a new occurrence should have been generated');

        $carried = $next->customFieldValues()->get()->keyBy('custom_field_id');

        // The reported failure: this is the one that came back blank.
        $this->assertSame(
            $dayShift->id,
            (int) ($carried[$shift->id]->value_option_id ?? 0),
            'the single-select option must carry to the next occurrence',
        );

        $this->assertSame('Restly Morales', $carried[$staff->id]->value_text ?? null);
        $this->assertNotNull($carried[$duty->id]->value_date ?? null);
    }

    public function test_a_field_with_a_default_is_reset_to_it_rather_than_carried(): void
    {
        // The one case where a single-select legitimately does not carry: the
        // project set a default, which is what each cycle should start from.
        $actor = User::factory()->create();
        $project = Project::factory()->create();

        $status = $this->field($project, 'Roster Status', 'single_select');
        $pending = CustomFieldOption::create(['custom_field_id' => $status->id, 'label' => 'Pending', 'position' => 0]);
        $signedOff = CustomFieldOption::create(['custom_field_id' => $status->id, 'label' => 'Signed Off', 'position' => 1]);
        $status->update(['config' => ['default_value' => $pending->id]]);

        $task = Task::factory()->create([
            'project_id' => $project->id,
            'status' => 'in_progress',
            'is_recurring' => true,
            // The table carries these as columns alongside the JSON config.
            'recurrence_frequency' => 'daily',
            'recurrence_interval' => 1,
            'recurrence_config' => ['frequency' => 'daily', 'interval' => 1],
            'due_date' => now()->startOfDay(),
        ]);

        $cfv = new TaskCustomFieldValue(['task_id' => $task->id, 'custom_field_id' => $status->id]);
        $cfv->setTypedValue('single_select', $signedOff->id);
        $cfv->save();

        $task->status = 'done';
        $next = RecurringTaskService::generateNextIfCompleted($task, 'in_progress', $actor);

        $this->assertSame(
            $pending->id,
            (int) $next->customFieldValues()->where('custom_field_id', $status->id)->value('value_option_id'),
            'a defaulted field resets to its default, not last cycle answer',
        );
    }
}
