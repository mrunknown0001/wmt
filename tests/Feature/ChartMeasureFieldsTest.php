<?php

namespace Tests\Feature;

use App\Models\CustomField;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Which custom fields the Y axis will accept.
 *
 * The rule is not one rule: a total or an average needs something numeric,
 * while counting how many tasks hold a value — or how many different values
 * there are — works on a date, a select, a person, anything. The server used to
 * apply the numeric rule to every field measure, which is why most of a
 * project's own data could not be put on an axis.
 */
class ChartMeasureFieldsTest extends TestCase
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

    private function field(string $type, string $name = 'A field'): CustomField
    {
        return CustomField::create([
            'project_id' => $this->project->id,
            'name' => $name,
            'type' => $type,
            'position' => 1,
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

    public static function everyFieldType(): array
    {
        return [
            'number' => ['number'],
            'text' => ['text'],
            'textarea' => ['textarea'],
            'date' => ['date'],
            'single select' => ['single_select'],
            'multi select' => ['multi_select'],
            'people' => ['people'],
            'week of year' => ['week_of_year'],
            'formula' => ['formula'],
        ];
    }

    #[DataProvider('everyFieldType')]
    public function test_any_field_can_be_counted(string $type): void
    {
        $field = $this->field($type);

        $this->newChart([
            'measure' => 'count_filled',
            'measure_custom_field_id' => $field->id,
        ])->assertSuccessful();

        $this->newChart([
            'measure' => 'count_distinct',
            'measure_custom_field_id' => $field->id,
        ])->assertSuccessful();
    }

    public static function nonNumericTypes(): array
    {
        return [
            'text' => ['text'],
            'textarea' => ['textarea'],
            'date' => ['date'],
            'single select' => ['single_select'],
            'multi select' => ['multi_select'],
            'people' => ['people'],
            'week of year' => ['week_of_year'],
        ];
    }

    #[DataProvider('nonNumericTypes')]
    public function test_only_numbers_can_be_totalled(string $type): void
    {
        $field = $this->field($type);

        $this->newChart([
            'measure' => 'sum_custom_field',
            'measure_custom_field_id' => $field->id,
        ])->assertStatus(422);
    }

    public function test_a_number_field_can_be_totalled_and_averaged(): void
    {
        $field = $this->field('number', 'Cost');

        foreach (['sum_custom_field', 'avg_custom_field'] as $measure) {
            $this->newChart([
                'measure' => $measure,
                'measure_custom_field_id' => $field->id,
            ])->assertSuccessful();
        }
    }

    public function test_a_formula_field_can_be_totalled(): void
    {
        $field = $this->field('formula', 'Margin');
        $field->update(['config' => ['formula' => '1 + 1', 'result_type' => 'number']]);

        $this->newChart([
            'measure' => 'sum_custom_field',
            'measure_custom_field_id' => $field->id,
        ])->assertSuccessful();
    }

    public function test_a_yes_no_formula_cannot_be_totalled(): void
    {
        $field = $this->field('formula', 'Passed');
        $field->update(['config' => ['formula' => 'Cost > 10', 'result_type' => 'boolean']]);

        // It resolves to a number on screen, but adding up a column of Yes/No
        // gives a figure that reads like money and is not.
        $this->newChart([
            'measure' => 'sum_custom_field',
            'measure_custom_field_id' => $field->id,
        ])->assertStatus(422);

        // Counting how many tasks answered it is still a fair question.
        $this->newChart([
            'measure' => 'count_filled',
            'measure_custom_field_id' => $field->id,
        ])->assertSuccessful();
    }

    public function test_a_field_measure_needs_a_field(): void
    {
        foreach (['sum_custom_field', 'avg_custom_field', 'count_filled', 'count_distinct'] as $measure) {
            $this->newChart(['measure' => $measure])->assertStatus(422);
        }
    }

    public function test_a_field_from_another_project_is_refused(): void
    {
        $other = Project::create([
            'name' => 'Beta', 'status' => 'active', 'owner_id' => $this->owner->id,
        ]);

        $stranger = CustomField::create([
            'project_id' => $other->id, 'name' => 'Theirs', 'type' => 'number', 'position' => 1,
        ]);

        $this->newChart([
            'measure' => 'count_filled',
            'measure_custom_field_id' => $stranger->id,
        ])->assertStatus(422);
    }

    public function test_the_chosen_field_is_stored_with_the_chart(): void
    {
        $field = $this->field('single_select', 'Client');

        $this->newChart([
            'measure' => 'count_distinct',
            'measure_custom_field_id' => $field->id,
        ])->assertSuccessful();

        $config = json_decode(\DB::table('project_charts')->latest('id')->value('config'), true);

        $this->assertSame('count_distinct', $config['measure']);
        $this->assertSame($field->id, $config['measure_custom_field_id']);
    }

    public function test_counting_is_dropped_when_the_measure_goes_back_to_counting_tasks(): void
    {
        $field = $this->field('date', 'Sign-off');

        $this->newChart([
            'measure' => 'count',
            'measure_custom_field_id' => $field->id,
        ])->assertSuccessful();

        $config = json_decode(\DB::table('project_charts')->latest('id')->value('config'), true);

        // Plain task counting needs no field, so storing one would be config
        // that never gets read and quietly misleads the next reader.
        $this->assertNull($config['measure_custom_field_id']);
    }
}
