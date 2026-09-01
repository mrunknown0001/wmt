<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\ProjectViewPreference;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

/**
 * A project's task sort belongs to the person, not the browser.
 *
 * It was kept in localStorage first, which meant a sort chosen at a desk was
 * gone on a laptop and shared with anyone else using that machine.
 */
class ProjectSortPreferenceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        Permission::findOrCreate('view-projects');
        Permission::findOrCreate('manage-projects');
    }

    private function owner(): User
    {
        $user = User::factory()->create(['is_active' => true]);
        $user->givePermissionTo('view-projects');

        return $user;
    }

    private function project(User $owner): Project
    {
        return Project::create([
            'name' => 'Sortable',
            'status' => 'active',
            'owner_id' => $owner->id,
        ]);
    }

    public function test_a_sort_is_saved_for_that_person_and_project(): void
    {
        $user = $this->owner();
        $project = $this->project($user);

        $this->actingAs($user)
            ->patchJson("/projects/{$project->id}/view-preferences", [
                'sort' => ['key' => 'title', 'direction' => 'desc'],
            ])
            ->assertOk()
            ->assertJson(['sort' => ['key' => 'title', 'direction' => 'desc']]);

        $row = ProjectViewPreference::where('user_id', $user->id)
            ->where('project_id', $project->id)
            ->first();

        $this->assertNotNull($row);
        $this->assertSame(['sort' => ['key' => 'title', 'direction' => 'desc']], $row->preferences);
    }

    public function test_the_saved_sort_comes_back_on_the_project_page(): void
    {
        $user = $this->owner();
        $project = $this->project($user);

        $this->actingAs($user)->patchJson("/projects/{$project->id}/view-preferences", [
            'sort' => ['key' => 'cf-7', 'direction' => 'asc'],
        ])->assertOk();

        $props = $this->actingAs($user)->get("/projects/{$project->id}")
            ->assertOk()
            ->viewData('page')['props'];

        $this->assertSame(['key' => 'cf-7', 'direction' => 'asc'], $props['savedSort']);
    }

    /** The whole point of moving it off the browser: it is per person. */
    public function test_one_persons_sort_is_not_anothers(): void
    {
        $owner = $this->owner();
        $project = $this->project($owner);

        $other = $this->owner();
        $project->members()->attach($other->id, ['role' => 'member']);

        $this->actingAs($owner)->patchJson("/projects/{$project->id}/view-preferences", [
            'sort' => ['key' => 'title', 'direction' => 'desc'],
        ])->assertOk();

        $props = $this->actingAs($other)->get("/projects/{$project->id}")
            ->assertOk()->viewData('page')['props'];

        $this->assertNull($props['savedSort']);
    }

    public function test_the_same_person_keeps_a_separate_sort_per_project(): void
    {
        $user = $this->owner();
        $one = $this->project($user);
        $two = Project::create(['name' => 'Other', 'status' => 'active', 'owner_id' => $user->id]);

        $this->actingAs($user)->patchJson("/projects/{$one->id}/view-preferences", [
            'sort' => ['key' => 'title', 'direction' => 'asc'],
        ])->assertOk();
        $this->actingAs($user)->patchJson("/projects/{$two->id}/view-preferences", [
            'sort' => ['key' => 'priority', 'direction' => 'desc'],
        ])->assertOk();

        $this->assertSame(
            ['key' => 'title', 'direction' => 'asc'],
            $this->actingAs($user)->get("/projects/{$one->id}")->viewData('page')['props']['savedSort']
        );
        $this->assertSame(
            ['key' => 'priority', 'direction' => 'desc'],
            $this->actingAs($user)->get("/projects/{$two->id}")->viewData('page')['props']['savedSort']
        );
    }

    /** Turning sorting off has to be saved too, or it comes back on the next visit. */
    public function test_clearing_the_sort_is_remembered(): void
    {
        $user = $this->owner();
        $project = $this->project($user);

        $this->actingAs($user)->patchJson("/projects/{$project->id}/view-preferences", [
            'sort' => ['key' => 'title', 'direction' => 'desc'],
        ])->assertOk();

        $this->actingAs($user)->patchJson("/projects/{$project->id}/view-preferences", [
            'sort' => null,
        ])->assertOk()->assertJson(['sort' => null]);

        $this->assertNull(
            $this->actingAs($user)->get("/projects/{$project->id}")->viewData('page')['props']['savedSort']
        );
    }

    public function test_a_nonsense_direction_is_refused(): void
    {
        $user = $this->owner();
        $project = $this->project($user);

        $this->actingAs($user)
            ->patchJson("/projects/{$project->id}/view-preferences", [
                'sort' => ['key' => 'title', 'direction' => 'sideways'],
            ])
            ->assertStatus(422);
    }

    public function test_somebody_who_cannot_see_the_project_cannot_save_against_it(): void
    {
        $owner = $this->owner();
        $project = $this->project($owner);

        $outsider = User::factory()->create(['is_active' => true]);

        $this->actingAs($outsider)
            ->patchJson("/projects/{$project->id}/view-preferences", [
                'sort' => ['key' => 'title', 'direction' => 'asc'],
            ])
            ->assertForbidden();

        $this->assertDatabaseCount('project_view_preferences', 0);
    }

    /** Deleting a project should not leave its preferences behind. */
    public function test_preferences_go_with_the_project(): void
    {
        $user = $this->owner();
        $user->givePermissionTo('manage-projects');
        $project = $this->project($user);

        $this->actingAs($user)->patchJson("/projects/{$project->id}/view-preferences", [
            'sort' => ['key' => 'title', 'direction' => 'asc'],
        ])->assertOk();

        $this->assertDatabaseCount('project_view_preferences', 1);

        $project->forceDelete();

        $this->assertDatabaseCount('project_view_preferences', 0);
    }
}
