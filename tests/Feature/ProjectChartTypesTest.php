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

    // ---- the time axis ----

    public function test_a_time_chart_can_be_grouped_by_week_number(): void
    {
        $this->newChart([
            'chart_type' => 'line',
            'group_by' => 'completed_over_time',
            'time_grouping' => 'week_number',
            'y_label' => 'Tasks',
            'x_label' => 'Week',
        ])->assertSuccessful();

        $config = json_decode(\DB::table('project_charts')->latest('id')->first()->config, true);

        $this->assertSame('week_number', $config['time_grouping']);
        $this->assertSame('Week', $config['x_label']);
        $this->assertSame('Tasks', $config['y_label']);
        // Counting tasks is the default measure, which is what the Y axis wants.
        $this->assertSame('count', $config['measure']);
    }

    public static function timeGroupings(): array
    {
        return [
            'auto' => ['auto'],
            'day' => ['day'],
            'week' => ['week'],
            'week number' => ['week_number'],
            'month' => ['month'],
        ];
    }

    #[DataProvider('timeGroupings')]
    public function test_every_grouping_in_the_picker_is_accepted(string $grouping): void
    {
        $this->newChart([
            'chart_type' => 'area',
            'group_by' => 'created_over_time',
            'time_grouping' => $grouping,
        ])->assertSuccessful();

        $config = json_decode(\DB::table('project_charts')->latest('id')->first()->config, true);

        $this->assertSame($grouping, $config['time_grouping']);
    }

    public function test_an_unknown_grouping_is_rejected(): void
    {
        $this->newChart([
            'chart_type' => 'line',
            'group_by' => 'completed_over_time',
            'time_grouping' => 'fortnight',
        ])->assertStatus(422);
    }

    public function test_a_category_chart_stores_no_grouping(): void
    {
        // A status axis has no buckets to widen; storing one would be dead
        // config that reappears if the chart is later switched to a line.
        $this->newChart([
            'chart_type' => 'bar',
            'group_by' => 'status',
            'time_grouping' => 'week_number',
        ])->assertSuccessful();

        $config = json_decode(\DB::table('project_charts')->latest('id')->first()->config, true);

        $this->assertNull($config['time_grouping']);
    }

    public function test_an_existing_time_chart_defaults_to_automatic(): void
    {
        $this->newChart(['chart_type' => 'line', 'group_by' => 'due_over_time'])->assertSuccessful();

        $config = json_decode(\DB::table('project_charts')->latest('id')->first()->config, true);

        $this->assertSame('auto', $config['time_grouping']);
    }

    // ---- flexibility: window, order, dimensions ----

    public static function newDimensions(): array
    {
        return [
            'created by' => ['created_by'],
            'overdue' => ['overdue'],
            'has due date' => ['has_due_date'],
        ];
    }

    #[DataProvider('newDimensions')]
    public function test_the_new_dimensions_are_accepted(string $dimension): void
    {
        $this->newChart(['chart_type' => 'column', 'group_by' => $dimension])->assertSuccessful();

        $this->assertDatabaseHas('project_charts', ['group_by' => $dimension]);
    }

    public function test_a_chart_can_be_limited_to_a_window(): void
    {
        $this->newChart([
            'chart_type' => 'bar',
            'group_by' => 'assignee',
            'date_range' => 'last_30',
            'date_field' => 'completed',
        ])->assertSuccessful();

        $config = json_decode(\DB::table('project_charts')->latest('id')->first()->config, true);

        $this->assertSame('last_30', $config['date_range']);
        $this->assertSame('completed', $config['date_field']);
    }

    public function test_a_custom_window_keeps_both_ends(): void
    {
        $this->newChart([
            'chart_type' => 'bar',
            'group_by' => 'status',
            'date_range' => 'custom',
            'date_from' => '2026-01-01',
            'date_to' => '2026-06-30',
        ])->assertSuccessful();

        $config = json_decode(\DB::table('project_charts')->latest('id')->first()->config, true);

        $this->assertSame('2026-01-01', $config['date_from']);
        $this->assertSame('2026-06-30', $config['date_to']);
    }

    public function test_a_window_that_ends_before_it_starts_is_rejected(): void
    {
        $this->newChart([
            'chart_type' => 'bar',
            'group_by' => 'status',
            'date_range' => 'custom',
            'date_from' => '2026-06-30',
            'date_to' => '2026-01-01',
        ])->assertStatus(422);
    }

    public function test_dates_are_dropped_when_the_window_is_not_custom(): void
    {
        $this->newChart([
            'chart_type' => 'bar',
            'group_by' => 'status',
            'date_range' => 'this_year',
            'date_from' => '2026-01-01',
            'date_to' => '2026-06-30',
        ])->assertSuccessful();

        $config = json_decode(\DB::table('project_charts')->latest('id')->first()->config, true);

        // Stale endpoints would come back to life if the range were later
        // switched to custom.
        $this->assertNull($config['date_from']);
        $this->assertNull($config['date_to']);
    }

    public function test_a_time_chart_takes_its_date_field_from_the_axis(): void
    {
        $this->newChart([
            'chart_type' => 'line',
            'group_by' => 'completed_over_time',
            'date_range' => 'last_90',
            'date_field' => 'due',
        ])->assertSuccessful();

        $config = json_decode(\DB::table('project_charts')->latest('id')->first()->config, true);

        // Windowing on a different date than the axis plots would cut the axis
        // somewhere it does not run.
        $this->assertSame('last_90', $config['date_range']);
        $this->assertNull($config['date_field']);
    }

    public function test_bars_can_be_ordered_and_capped(): void
    {
        $this->newChart([
            'chart_type' => 'bar',
            'group_by' => 'assignee',
            'sort' => 'value_desc',
            'max_buckets' => 5,
        ])->assertSuccessful();

        $config = json_decode(\DB::table('project_charts')->latest('id')->first()->config, true);

        $this->assertSame('value_desc', $config['sort']);
        $this->assertSame(5, $config['max_buckets']);
    }

    public function test_an_absurd_bucket_cap_is_rejected(): void
    {
        $this->newChart([
            'chart_type' => 'bar', 'group_by' => 'status', 'max_buckets' => 500,
        ])->assertStatus(422);
    }

    public function test_ordering_is_not_stored_where_there_are_no_bars(): void
    {
        foreach ([['line', 'completed_over_time'], ['metric', 'none']] as [$type, $dimension]) {
            $this->newChart([
                'chart_type' => $type,
                'group_by' => $dimension,
                'sort' => 'value_desc',
                'max_buckets' => 5,
            ])->assertSuccessful();

            $config = json_decode(\DB::table('project_charts')->latest('id')->first()->config, true);

            $this->assertNull($config['sort'], "{$type} should not store a sort");
            $this->assertNull($config['max_buckets'], "{$type} should not store a cap");
        }
    }

    public function test_a_chart_can_filter_and_split_at_once(): void
    {
        // The combination the whole thing exists for: "urgent tasks by
        // assignee, split by status, this quarter, largest first".
        $this->newChart([
            'chart_type' => 'column',
            'group_by' => 'assignee',
            'stack_by' => 'status',
            'filters' => [['field' => 'priority', 'value' => 'urgent']],
            'date_range' => 'this_quarter',
            'sort' => 'value_desc',
            'max_buckets' => 8,
        ])->assertSuccessful();

        $config = json_decode(\DB::table('project_charts')->latest('id')->first()->config, true);

        $this->assertSame('status', $config['stack_by']);
        $this->assertCount(1, $config['filters']);
        $this->assertSame('this_quarter', $config['date_range']);
        $this->assertSame('value_desc', $config['sort']);
    }

    // ---- legends ----

    public function test_a_category_chart_can_ask_for_a_legend(): void
    {
        $this->newChart([
            'chart_type' => 'column',
            'group_by' => 'status',
            'show_legend' => true,
        ])->assertSuccessful();

        $config = json_decode(\DB::table('project_charts')->latest('id')->first()->config, true);

        $this->assertTrue($config['show_legend']);
    }

    public function test_a_legend_is_off_unless_asked_for(): void
    {
        $this->newChart(['chart_type' => 'bar', 'group_by' => 'status'])->assertSuccessful();

        $config = json_decode(\DB::table('project_charts')->latest('id')->first()->config, true);

        // It would only repeat the axis labels on a single-series chart.
        $this->assertFalse($config['show_legend']);
    }

    public function test_types_that_draw_their_own_legend_do_not_store_the_flag(): void
    {
        // A time axis has no categories to name, and a circle already lists its
        // slices beside itself.
        foreach ([['line', 'completed_over_time'], ['donut', 'status'], ['pie', 'status']] as [$type, $dimension]) {
            $this->newChart([
                'chart_type' => $type,
                'group_by' => $dimension,
                'show_legend' => true,
            ])->assertSuccessful();

            $config = json_decode(\DB::table('project_charts')->latest('id')->first()->config, true);

            $this->assertFalse($config['show_legend'], "{$type} should not store show_legend");
        }
    }

    // ---- cards ----

    public function test_a_card_saves_with_no_dimension(): void
    {
        $this->newChart([
            'title' => 'Open tasks',
            'chart_type' => 'metric',
            'group_by' => 'none',
            'measure' => 'count',
            'scope' => 'active',
        ])->assertSuccessful();

        $this->assertDatabaseHas('project_charts', [
            'project_id' => $this->project->id,
            'chart_type' => 'metric',
            'group_by' => 'none',
        ]);
    }

    public function test_a_card_keeps_its_filters_and_target(): void
    {
        $this->newChart([
            'chart_type' => 'metric',
            'group_by' => 'none',
            'measure' => 'sum_estimate',
            'filters' => [
                ['field' => 'priority', 'value' => 'urgent'],
                ['field' => 'status', 'value' => 'in_progress'],
            ],
            'compare' => 'target',
            'target' => 40,
        ])->assertSuccessful();

        $config = json_decode(\DB::table('project_charts')->latest('id')->first()->config, true);

        $this->assertCount(2, $config['filters']);
        $this->assertSame('priority', $config['filters'][0]['field']);
        $this->assertSame('urgent', $config['filters'][0]['value']);
        $this->assertSame('target', $config['compare']);
        // assertEquals, not assertSame: JSON writes 40.0 back as an int.
        $this->assertEquals(40, $config['target']);
        $this->assertSame('sum_estimate', $config['measure']);
    }

    public function test_a_target_is_dropped_when_nothing_is_being_compared(): void
    {
        $this->newChart([
            'chart_type' => 'metric',
            'group_by' => 'none',
            'compare' => 'percent',
            'target' => 40,
        ])->assertSuccessful();

        $config = json_decode(\DB::table('project_charts')->latest('id')->first()->config, true);

        // Storing it would resurrect a stale number if the card were later
        // switched back to comparing against a target.
        $this->assertNull($config['target']);
        $this->assertSame('percent', $config['compare']);
    }

    public function test_a_card_refuses_a_real_dimension(): void
    {
        $this->newChart([
            'chart_type' => 'metric',
            'group_by' => 'status',
        ])->assertStatus(422);
    }

    public function test_a_chart_refuses_the_card_dimension(): void
    {
        $this->newChart([
            'chart_type' => 'bar',
            'group_by' => 'none',
        ])->assertStatus(422);
    }

    public function test_a_chart_keeps_filters_but_not_the_card_comparison(): void
    {
        $this->newChart([
            'chart_type' => 'bar',
            'group_by' => 'status',
            'filters' => [['field' => 'priority', 'value' => 'urgent']],
            'compare' => 'target',
            'target' => 40,
        ])->assertSuccessful();

        $config = json_decode(\DB::table('project_charts')->latest('id')->first()->config, true);

        // Filters apply to every type — "urgent tasks by status" is the whole
        // point. Comparing one figure against another is card-only.
        $this->assertCount(1, $config['filters']);
        $this->assertSame('urgent', $config['filters'][0]['value']);
        $this->assertNull($config['compare']);
        $this->assertNull($config['target']);
    }

    public function test_a_card_stores_no_chart_settings(): void
    {
        $this->newChart([
            'chart_type' => 'metric',
            'group_by' => 'none',
            'reference_lines' => [['label' => 'Target', 'value' => 40]],
            'manual_points' => [['label' => 'Last quarter', 'value' => 31]],
        ])->assertSuccessful();

        $config = json_decode(\DB::table('project_charts')->latest('id')->first()->config, true);

        // A card has no axis to draw either against; `target` covers the need.
        $this->assertSame([], $config['reference_lines']);
        $this->assertSame([], $config['manual_points']);
    }

    public function test_too_many_filters_are_rejected(): void
    {
        $this->newChart([
            'chart_type' => 'metric',
            'group_by' => 'none',
            'filters' => array_fill(0, 6, ['field' => 'status', 'value' => 'done']),
        ])->assertStatus(422);
    }

    public function test_a_filter_on_an_unknown_dimension_is_rejected(): void
    {
        $this->newChart([
            'chart_type' => 'metric',
            'group_by' => 'none',
            'filters' => [['field' => 'due_over_time', 'value' => 'x']],
        ])->assertStatus(422);
    }

    public function test_a_card_can_be_turned_into_a_chart(): void
    {
        $this->newChart(['chart_type' => 'metric', 'group_by' => 'none'])->assertSuccessful();
        $id = \DB::table('project_charts')->latest('id')->value('id');

        $this->actingAs($this->owner)->putJson(
            "/projects/{$this->project->id}/charts/{$id}",
            ['title' => 'Now a chart', 'chart_type' => 'bar', 'group_by' => 'status']
        )->assertSuccessful();

        $this->assertDatabaseHas('project_charts', ['id' => $id, 'chart_type' => 'bar', 'group_by' => 'status']);
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

    // ---- grouped (side-by-side) bars ----

    private function storedConfig(): array
    {
        return json_decode(\DB::table('project_charts')->latest('id')->value('config'), true);
    }

    public function test_a_split_bar_can_be_grouped_side_by_side(): void
    {
        $this->newChart([
            'chart_type' => 'bar',
            'group_by' => 'assignee',
            'stack_by' => 'status',
            'bar_mode' => 'grouped',
        ])->assertSuccessful();

        $this->assertSame('grouped', $this->storedConfig()['bar_mode']);
    }

    public function test_an_invalid_bar_mode_is_rejected(): void
    {
        $this->newChart([
            'chart_type' => 'bar',
            'group_by' => 'assignee',
            'stack_by' => 'status',
            'bar_mode' => 'sideways',
        ])->assertStatus(422);
    }

    public function test_bar_mode_is_dropped_when_there_is_no_split_to_group(): void
    {
        // Nothing to sit side by side without a second dimension, so a grouped
        // flag on an unsplit chart is stored as null rather than kept as dead
        // config that the next reader has to second-guess.
        $this->newChart([
            'chart_type' => 'bar',
            'group_by' => 'assignee',
            'bar_mode' => 'grouped',
        ])->assertSuccessful();

        $this->assertNull($this->storedConfig()['bar_mode']);
    }

    public function test_bar_mode_is_dropped_on_a_chart_that_cannot_cluster(): void
    {
        // A line already draws one line per series; there is no bar to group.
        $this->newChart([
            'chart_type' => 'line',
            'group_by' => 'created_over_time',
            'stack_by' => 'status',
            'bar_mode' => 'grouped',
        ])->assertSuccessful();

        $this->assertNull($this->storedConfig()['bar_mode']);
    }

    // ---- two custom fields as the two groupings ----

    private function selectField(string $name): \App\Models\CustomField
    {
        return \App\Models\CustomField::create([
            'project_id' => $this->project->id,
            'name' => $name,
            'type' => 'single_select',
            'position' => 1,
        ]);
    }

    public function test_a_custom_field_can_be_the_second_grouping(): void
    {
        $client = $this->selectField('Client');

        $this->newChart([
            'chart_type' => 'bar',
            'group_by' => 'status',
            'stack_by' => 'custom_field',
            'stack_custom_field_id' => $client->id,
        ])->assertSuccessful();

        $config = $this->storedConfig();
        $this->assertSame('custom_field', $config['stack_by']);
        $this->assertSame($client->id, $config['stack_custom_field_id']);
    }

    public function test_two_different_custom_fields_can_be_the_two_groupings(): void
    {
        $client = $this->selectField('Client');
        $region = $this->selectField('Region');

        $this->newChart([
            'chart_type' => 'column',
            'group_by' => 'custom_field',
            'custom_field_id' => $client->id,
            'stack_by' => 'custom_field',
            'stack_custom_field_id' => $region->id,
            'bar_mode' => 'grouped',
        ])->assertSuccessful();

        $config = $this->storedConfig();
        $this->assertSame($client->id, $config['custom_field_id']);
        $this->assertSame($region->id, $config['stack_custom_field_id']);
    }

    public function test_the_same_custom_field_cannot_be_both_groupings(): void
    {
        $client = $this->selectField('Client');

        // One field twice is not two groupings — one series per bar, saying
        // nothing you could not read off the bar.
        $this->newChart([
            'chart_type' => 'bar',
            'group_by' => 'custom_field',
            'custom_field_id' => $client->id,
            'stack_by' => 'custom_field',
            'stack_custom_field_id' => $client->id,
        ])->assertStatus(422);
    }
}
