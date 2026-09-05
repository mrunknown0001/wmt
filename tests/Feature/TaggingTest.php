<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Tag;
use App\Models\Task;
use App\Models\TaskMinute;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Labels on projects, tasks and meeting minutes.
 *
 * One vocabulary across the three, matched by slug so a difference of casing or
 * punctuation cannot split the very set the tag exists to gather.
 */
class TaggingTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private Project $project;
    private Task $task;

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
    }

    public function test_a_project_carries_the_labels_it_is_given(): void
    {
        $this->actingAs($this->owner)
            ->putJson("/api/tags/project/{$this->project->id}", ['tags' => ['Budget', 'Q3']])
            ->assertOk()
            ->assertJsonCount(2, 'tags');

        $this->assertSame(['Budget', 'Q3'], $this->project->fresh()->tags->pluck('name')->sort()->values()->all());
    }

    public function test_the_same_word_spelt_differently_is_one_tag(): void
    {
        $this->actingAs($this->owner)
            ->putJson("/api/tags/project/{$this->project->id}", ['tags' => ['Budget', 'budget', ' BUDGET ', 'Budget!']])
            ->assertOk();

        $this->assertSame(1, Tag::count(), 'four spellings, one label');
        $this->assertSame('Budget', Tag::sole()->name, 'and it keeps the spelling it was first given');
        $this->assertSame('budget', Tag::sole()->slug);
    }

    public function test_tags_are_shared_across_the_things_that_carry_them(): void
    {
        $this->actingAs($this->owner)->putJson("/api/tags/project/{$this->project->id}", ['tags' => ['Budget']]);
        $this->actingAs($this->owner)->putJson("/api/tags/task/{$this->task->id}", ['tags' => ['budget']]);

        $tag = Tag::sole();
        $this->assertSame(1, $tag->projects()->count());
        $this->assertSame(1, $tag->tasks()->count());
    }

    public function test_sending_a_list_replaces_the_one_before_it(): void
    {
        $this->actingAs($this->owner)->putJson("/api/tags/task/{$this->task->id}", ['tags' => ['a', 'b', 'c']]);
        $this->actingAs($this->owner)->putJson("/api/tags/task/{$this->task->id}", ['tags' => ['b']]);

        $this->assertSame(['b'], $this->task->fresh()->tags->pluck('name')->all());
        // The tags themselves survive being taken off something.
        $this->assertSame(3, Tag::count());
    }

    public function test_nonsense_names_are_dropped_rather_than_stored(): void
    {
        $this->actingAs($this->owner)
            ->putJson("/api/tags/task/{$this->task->id}", ['tags' => ['  ', '!!!', 'real']])
            ->assertOk();

        $this->assertSame(['real'], $this->task->fresh()->tags->pluck('name')->all());
    }

    public function test_the_limits_are_enforced(): void
    {
        $this->actingAs($this->owner)
            ->putJson("/api/tags/task/{$this->task->id}", ['tags' => array_fill(0, 21, 'x')])
            ->assertStatus(422);

        $this->actingAs($this->owner)
            ->putJson("/api/tags/task/{$this->task->id}", ['tags' => [str_repeat('x', 41)]])
            ->assertStatus(422);
    }

    public function test_only_somebody_who_may_edit_the_thing_may_label_it(): void
    {
        $stranger = User::factory()->create(['is_active' => true]);

        $this->actingAs($stranger)
            ->putJson("/api/tags/project/{$this->project->id}", ['tags' => ['sneaky']])
            ->assertStatus(403);

        $this->actingAs($stranger)
            ->putJson("/api/tags/task/{$this->task->id}", ['tags' => ['sneaky']])
            ->assertStatus(403);

        $this->assertSame(0, Tag::count());
    }

    public function test_minutes_are_labelled_through_their_task(): void
    {
        $minute = TaskMinute::create(['task_id' => $this->task->id, 'meeting_title' => 'Kick-off']);

        $this->actingAs($this->owner)
            ->putJson("/api/tags/minute/{$minute->id}", ['tags' => ['Kick-off', 'Budget']])
            ->assertOk();

        $this->assertSame(2, $minute->fresh()->tags->count());

        // And somebody who cannot edit the task cannot label its minutes.
        $stranger = User::factory()->create(['is_active' => true]);
        $this->actingAs($stranger)
            ->putJson("/api/tags/minute/{$minute->id}", ['tags' => ['sneaky']])
            ->assertStatus(403);
    }

    public function test_an_unknown_kind_of_thing_cannot_be_tagged(): void
    {
        $this->actingAs($this->owner)
            ->putJson("/api/tags/user/{$this->owner->id}", ['tags' => ['nope']])
            ->assertNotFound();
    }

    public function test_the_autocomplete_offers_the_labels_people_actually_use(): void
    {
        $this->actingAs($this->owner)->putJson("/api/tags/project/{$this->project->id}", ['tags' => ['Popular', 'Rare']]);
        $this->actingAs($this->owner)->putJson("/api/tags/task/{$this->task->id}", ['tags' => ['Popular']]);

        $this->actingAs($this->owner)
            ->getJson('/api/tags')
            ->assertOk()
            ->assertJsonPath('tags.0.name', 'Popular')
            ->assertJsonPath('tags.0.uses', 2)
            ->assertJsonPath('tags.1.name', 'Rare')
            ->assertJsonPath('tags.1.uses', 1);

        $this->actingAs($this->owner)
            ->getJson('/api/tags?q=rar')
            ->assertOk()
            ->assertJsonCount(1, 'tags')
            ->assertJsonPath('tags.0.name', 'Rare');
    }

    public function test_deleting_a_tagged_record_takes_its_labels_off_with_it(): void
    {
        $this->actingAs($this->owner)->putJson("/api/tags/task/{$this->task->id}", ['tags' => ['Budget']]);

        $this->task->forceDelete();

        $this->assertSame(1, Tag::count(), 'the word survives');
        $this->assertSame(0, Tag::sole()->tasks()->count(), 'the attachment does not');
    }
}
