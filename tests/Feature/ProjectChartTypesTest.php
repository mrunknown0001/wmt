<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The chart types the project dashboard accepts.
 *
 * Column, area and pie join bar, line and donut. The rules that used to be
 * written against the name 'donut' now apply to the whole circular family, and
 * the rules written against 'line' apply to every time chart — these hold the
 * server to that so a type cannot be added to the picker and rejected on save.
 */
class ProjectChartTypesTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['manage-projects', 'view-projects'] as $name) {
            Permission::findOrCreate($name);
        }
        Role::findOrCreate('admin')->syncPermissions(['manage-projects', 'view-projects']);

        $this->owner = User::factory()->create(['is_active' => true]);
        $this->owner->assignRole('admin');

        $this->project = Project::create([
            'name' => 'Alpha', 'status' => 'active', 'owner_id' => $this->owner->id,
        ]);
    }

    private function newChart(array $overrides = [])
    {
        return $this->actingAs($this->owner)->postJson(
            "/projects/{$this->project->id}/charts",
            $overrides + [
                'title' => 'A chart',
                'chart_type' => 'bar',
                'group_by' => 'status',
            ]
        );
    }

    public static function categoryTypes(): array
    {
        return ['bar' => ['bar'], 'column' => ['column'], 'donut' => ['donut'], 'pie' => ['pie']];
    }

    public static function timeTypes(): array
    {
        return ['line' => ['line'], 'area' => ['area']];
    }

    public static function circularTypes(): array
    {
        return ['donut' => ['donut'], 'pie' => ['pie']];
    }

    // ---- every type in the picker is accepted ----

    #[DataProvider('categoryTypes')]
    public function test_a_category_type_saves_with_a_category_dimension(string $type): void
    {
        $this->newChart(['chart_type' => $type, 'group_by' => 'assignee'])->assertSuccessful();

        $this->assertDatabaseHas('project_charts', [
            'project_id' => $this->project->id,
            'chart_type' => $type,
            'group_by' => 'assignee',
        ]);
    }

    #[DataProvider('timeTypes')]
    public function test_a_time_type_saves_with_a_time_dimension(string $type): void
    {
        $this->newChart(['chart_type' => $type, 'group_by' => 'completed_over_time'])->assertSuccessful();

        $this->assertDatabaseHas('project_charts', ['chart_type' => $type]);
    }

    public function test_an_unknown_type_is_rejected(): void
    {
        $this->newChart(['chart_type' => 'radar'])->assertStatus(422);
    }

    // ---- the families keep their rules ----

    #[DataProvider('timeTypes')]
    public function test_a_time_type_refuses_a_category_dimension(string $type): void
    {
        $this->newChart(['chart_type' => $type, 'group_by' => 'status'])->assertStatus(422);
    }

    #[DataProvider('categoryTypes')]
    public function test_a_category_type_refuses_a_time_dimension(string $type): void
    {
        $this->newChart(['chart_type' => $type, 'group_by' => 'created_over_time'])->assertStatus(422);
    }

    #[DataProvider('circularTypes')]
    public function test_a_circular_type_cannot_be_split(string $type): void
    {
        $this->newChart([
            'chart_type' => $type,
            'group_by' => 'status',
            'stack_by' => 'assignee',
        ])->assertStatus(422);
    }

    public function test_a_column_can_be_split(): void
    {
        // The rule was about circles, not about bars standing up.
        $this->newChart([
            'chart_type' => 'column',
            'group_by' => 'status',
            'stack_by' => 'assignee',
        ])->assertSuccessful();
    }

    public function test_an_area_can_be_split(): void
    {
        $this->newChart([
            'chart_type' => 'area',
            'group_by' => 'completed_over_time',
            'stack_by' => 'assignee',
        ])->assertSuccessful();
    }

    #[DataProvider('circularTypes')]
    public function test_a_circular_type_cannot_show_an_average(string $type): void
    {
        $this->newChart([
            'chart_type' => $type,
            'group_by' => 'status',
            'measure' => 'avg_custom_field',
        ])->assertStatus(422);
    }

    public function test_a_dimension_still_cannot_split_itself(): void
    {
        $this->newChart([
            'chart_type' => 'column',
            'group_by' => 'status',
            'stack_by' => 'status',
        ])->assertStatus(422);
    }

    // ---- advanced options survive on the new types ----

    public function test_a_column_keeps_its_targets_axis_labels_and_manual_figures(): void
    {
        $this->newChart([
            'chart_type' => 'column',
            'group_by' => 'status',
            'x_label' => 'Status',
            'y_label' => 'Hours',
            'measure' => 'sum_estimate',
            'reference_lines' => [['label' => 'Target', 'value' => 40]],
            'manual_points' => [['label' => 'Last quarter', 'value' => 31]],
        ])->assertSuccessful();

        $chart = \DB::table('project_charts')->latest('id')->first();
        $config = json_decode($chart->config, true);

        $this->assertSame('Status', $config['x_label']);
        $this->assertSame('Hours', $config['y_label']);
        $this->assertSame('sum_estimate', $config['measure']);
        $this->assertSame('Target', $config['reference_lines'][0]['label']);
        $this->assertSame('Last quarter', $config['manual_points'][0]['label']);
    }

    #[DataProvider('circularTypes')]
    public function test_a_circular_type_drops_target_lines(string $type): void
    {
        $this->newChart([
            'chart_type' => $type,
            'group_by' => 'status',
            'reference_lines' => [['label' => 'Target', 'value' => 40]],
        ])->assertSuccessful();

        $chart = \DB::table('project_charts')->latest('id')->first();
        $config = json_decode($chart->config, true);

        // A line across a circle has nothing to measure against.
        $this->assertSame([], $config['reference_lines'] ?? []);
    }

    public function test_an_existing_chart_can_be_switched_to_a_new_type(): void
    {
        $this->newChart(['chart_type' => 'bar', 'group_by' => 'status'])->assertSuccessful();
        $id = \DB::table('project_charts')->latest('id')->value('id');

        $this->actingAs($this->owner)->putJson(
            "/projects/{$this->project->id}/charts/{$id}",
            ['title' => 'A chart', 'chart_type' => 'column', 'group_by' => 'status']
        )->assertSuccessful();

        $this->assertDatabaseHas('project_charts', ['id' => $id, 'chart_type' => 'column']);
    }
}
