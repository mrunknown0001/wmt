<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Filtering the project lists by label.
 *
 * Several labels mean "any of": asking for two piles is asking to see both,
 * not the handful of things filed under both at once.
 */
class ProjectListTagFilterTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['manage-projects', 'view-projects', 'manage-tasks', 'view-tasks'] as $name) {
            Permission::findOrCreate($name);
        }
        Role::findOrCreate('admin')->syncPermissions(Permission::all());

        $this->admin = User::factory()->create(['is_active' => true]);
        $this->admin->assignRole('admin');
    }

    private function project(string $name, array $tags = [], string $status = 'active'): Project
    {
        $project = Project::create(['name' => $name, 'status' => $status, 'owner_id' => $this->admin->id]);

        if ($tags) {
            $project->syncTagNames($tags, $this->admin->id);
        }

        return $project;
    }

    public function test_one_label_narrows_the_list(): void
    {
        $this->project('Hatchery Fit-out', ['Biosecurity']);
        $this->project('Cold Chain', ['Logistics']);
        $this->project('Store Room');

        $this->actingAs($this->admin)
            ->get('/projects?tag=biosecurity')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('projects.data', 1)
                ->where('projects.data.0.name', 'Hatchery Fit-out')
                ->where('filters.tag', ['biosecurity']));
    }

    public function test_several_labels_show_both_piles(): void
    {
        $this->project('Hatchery Fit-out', ['Biosecurity']);
        $this->project('Cold Chain', ['Logistics']);
        $this->project('Store Room');

        $this->actingAs($this->admin)
            ->get('/projects?tag=biosecurity,logistics')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->has('projects.data', 2));
    }

    public function test_a_label_is_matched_however_it_is_written(): void
    {
        $this->project('Hatchery Fit-out', ['Biosecurity']);

        foreach (['Biosecurity', 'BIOSECURITY', ' biosecurity '] as $typed) {
            $this->actingAs($this->admin)
                ->get('/projects?tag=' . urlencode($typed))
                ->assertOk()
                ->assertInertia(fn ($page) => $page->has('projects.data', 1));
        }
    }

    public function test_the_filter_offers_only_labels_on_projects_in_this_list(): void
    {
        $this->project('Hatchery Fit-out', ['Biosecurity']);
        $this->project('Old Build', ['Retired'], 'archived');

        $this->actingAs($this->admin)
            ->get('/projects')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('tags', 1)
                ->where('tags.0.name', 'Biosecurity'));

        // The archived list offers its own, not the live one's.
        $this->actingAs($this->admin)
            ->get('/projects/archived')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('tags', 1)
                ->where('tags.0.name', 'Retired'));
    }

    public function test_the_archived_list_filters_by_label_too(): void
    {
        $this->project('Old Build', ['Retired'], 'archived');
        $this->project('Older Build', ['Superseded'], 'archived');

        $this->actingAs($this->admin)
            ->get('/projects/archived?tag=retired')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('projects.data', 1)
                ->where('projects.data.0.name', 'Old Build'));
    }

    public function test_the_rows_carry_their_labels(): void
    {
        $this->project('Hatchery Fit-out', ['Biosecurity', 'Urgent']);

        $this->actingAs($this->admin)
            ->get('/projects')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->has('projects.data.0.tags', 2));
    }

    public function test_an_unknown_label_narrows_to_nothing_rather_than_everything(): void
    {
        $this->project('Hatchery Fit-out', ['Biosecurity']);

        $this->actingAs($this->admin)
            ->get('/projects?tag=nothing-by-that-name')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->has('projects.data', 0));
    }

    public function test_a_blank_filter_leaves_the_list_alone(): void
    {
        $this->project('Hatchery Fit-out', ['Biosecurity']);
        $this->project('Store Room');

        $this->actingAs($this->admin)
            ->get('/projects?tag=')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->has('projects.data', 2)->where('filters.tag', []));
    }

    public function test_the_filter_does_not_widen_what_somebody_may_see(): void
    {
        $owner = User::factory()->create(['is_active' => true]);
        $theirs = Project::create(['name' => 'Not mine', 'status' => 'active', 'owner_id' => $owner->id]);
        $theirs->syncTagNames(['Biosecurity'], $owner->id);

        // Allowed to see the projects list at all, but a member of nothing:
        // the label must not be a way round that.
        $outsider = User::factory()->create(['is_active' => true]);
        $outsider->givePermissionTo('view-projects');

        $this->actingAs($outsider)
            ->get('/projects?tag=biosecurity')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->has('projects.data', 0));
    }
}
