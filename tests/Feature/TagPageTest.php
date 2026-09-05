<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\TaskMinute;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The page a label opens.
 *
 * Choosing a tag has to arrive somewhere and show the whole of it — the five
 * rows a dropdown has room for is not what somebody who picked a label wanted.
 */
class TagPageTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private Project $project;
    private Task $task;
    private TaskMinute $minute;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['manage-projects', 'manage-tasks', 'view-projects', 'view-tasks', 'view-users'] as $name) {
            Permission::findOrCreate($name);
        }
        Role::findOrCreate('admin')->syncPermissions(Permission::all());

        $this->owner = User::factory()->create(['is_active' => true, 'name' => 'Ada']);
        $this->project = Project::create(['name' => 'Hatchery Fit-out', 'status' => 'active', 'owner_id' => $this->owner->id]);
        $this->task = Task::create([
            'project_id' => $this->project->id, 'title' => 'Install feed lines',
            'status' => 'to_do', 'priority' => 'medium', 'assigned_to' => $this->owner->id,
        ]);
        $this->minute = TaskMinute::create([
            'task_id' => $this->task->id, 'meeting_title' => 'Weekly site walk', 'meeting_date' => '2026-09-01',
        ]);

        $this->project->syncTagNames(['Biosecurity'], $this->owner->id);
        $this->task->syncTagNames(['Biosecurity', 'Urgent'], $this->owner->id);
        $this->minute->syncTagNames(['Biosecurity'], $this->owner->id);
    }

    public function test_the_page_lists_the_vocabulary_with_its_counts(): void
    {
        $this->actingAs($this->owner)
            ->get('/tags')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Tags/Index', false)
                ->has('tags', 2)
                ->where('tags.0.name', 'Biosecurity')
                ->where('tags.0.uses', 3)
                ->where('selected', null)
                ->where('results', null));
    }

    public function test_naming_a_label_opens_it_with_everything_under_it(): void
    {
        $this->actingAs($this->owner)
            ->get('/tags?q=Biosecurity')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('selected.name', 'Biosecurity')
                ->where('results.projects.total', 1)
                ->where('results.projects.rows.0.name', 'Hatchery Fit-out')
                ->where('results.tasks.total', 1)
                ->where('results.tasks.rows.0.title', 'Install feed lines')
                ->where('results.minutes.total', 1)
                ->where('results.minutes.rows.0.title', 'Weekly site walk'));
    }

    public function test_the_name_is_matched_the_way_a_tag_is(): void
    {
        // What a chip sends is the stored name; what a person types is whatever
        // they type. Both reduce to the same label.
        foreach (['biosecurity', 'BIOSECURITY', ' Biosecurity '] as $typed) {
            $this->actingAs($this->owner)
                ->get('/tags?q=' . urlencode($typed))
                ->assertOk()
                ->assertInertia(fn ($page) => $page->where('selected.slug', 'biosecurity'));
        }
    }

    public function test_a_partial_word_filters_the_list_and_opens_the_only_match(): void
    {
        $this->actingAs($this->owner)
            ->get('/tags?q=bios')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('tags', 1)
                ->where('selected.name', 'Biosecurity')
                ->where('results.tasks.total', 1));
    }

    public function test_a_partial_word_matching_several_opens_none_of_them(): void
    {
        $this->project->syncTagNames(['Biosecurity', 'Biology'], $this->owner->id);

        $this->actingAs($this->owner)
            ->get('/tags?q=bio')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->has('tags', 2)->where('selected', null));
    }

    public function test_the_page_shows_nobody_work_they_cannot_see(): void
    {
        $stranger = User::factory()->create(['is_active' => true]);

        $this->actingAs($stranger)
            ->get('/tags?q=Biosecurity')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                // The word is not a secret; the work behind it is.
                ->where('selected.name', 'Biosecurity')
                ->where('results.projects.total', 0)
                ->where('results.tasks.total', 0)
                ->where('results.minutes.total', 0));
    }

    public function test_a_label_nothing_carries_is_not_listed(): void
    {
        $this->task->syncTagNames(['Biosecurity'], $this->owner->id);   // drops Urgent

        $this->actingAs($this->owner)
            ->get('/tags')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->has('tags', 1)->where('tags.0.name', 'Biosecurity'));
    }

    public function test_an_unknown_label_opens_nothing_rather_than_failing(): void
    {
        $this->actingAs($this->owner)
            ->get('/tags?q=nothing-by-that-name')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->has('tags', 0)->where('selected', null));
    }

    public function test_a_guest_is_sent_to_the_login_page(): void
    {
        $this->get('/tags')->assertRedirect('/login');
    }
}
