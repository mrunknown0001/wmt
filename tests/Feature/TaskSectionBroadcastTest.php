<?php

namespace Tests\Feature;

use App\Events\TaskSectionUpdated;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskSection;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

/**
 * Section changes reach everyone else on the board without a reload.
 *
 * These four endpoints broadcast nothing at all until now, which is why adding,
 * renaming, removing or reordering a section only appeared for the person who
 * did it.
 */
class TaskSectionBroadcastTest extends TestCase
{
    use RefreshDatabase;

    private function manager(): User
    {
        Permission::findOrCreate('manage-tasks');
        $user = User::factory()->create(['is_active' => true]);
        $user->givePermissionTo('manage-tasks');

        return $user;
    }

    protected function setUp(): void
    {
        parent::setUp();
        Event::fake([TaskSectionUpdated::class]);
    }

    public function test_creating_a_section_is_broadcast(): void
    {
        $user = $this->manager();
        $project = Project::factory()->create();

        $this->actingAs($user)
            ->postJson("/projects/{$project->id}/sections", ['name' => 'Backlog'])
            ->assertCreated();

        Event::assertDispatched(TaskSectionUpdated::class, fn ($e) =>
            $e->projectId === $project->id
            && $e->changeType === 'created'
            && $e->section['name'] === 'Backlog');
    }

    public function test_renaming_a_section_is_broadcast(): void
    {
        $user = $this->manager();
        $project = Project::factory()->create();
        $section = TaskSection::create(['project_id' => $project->id, 'name' => 'Old', 'position' => 0]);

        $this->actingAs($user)
            ->patchJson("/projects/{$project->id}/sections/{$section->id}", ['name' => 'New'])
            ->assertOk();

        Event::assertDispatched(TaskSectionUpdated::class, fn ($e) =>
            $e->changeType === 'updated' && $e->section['name'] === 'New');
    }

    public function test_deleting_a_section_broadcasts_it_and_its_children(): void
    {
        $user = $this->manager();
        $project = Project::factory()->create();
        $parent = TaskSection::create(['project_id' => $project->id, 'name' => 'Parent', 'position' => 0]);
        $child = TaskSection::create([
            'project_id' => $project->id, 'name' => 'Child', 'position' => 0, 'parent_id' => $parent->id,
        ]);

        $this->actingAs($user)
            ->deleteJson("/projects/{$project->id}/sections/{$parent->id}")
            ->assertOk();

        // The child cascades, so a listener that only heard about the parent
        // would leave it on the board.
        Event::assertDispatched(TaskSectionUpdated::class, fn ($e) =>
            $e->changeType === 'deleted'
            && $e->section['id'] === $parent->id
            && in_array($child->id, $e->section['child_ids'], true));
    }

    public function test_reordering_broadcasts_the_resulting_order(): void
    {
        $user = $this->manager();
        $project = Project::factory()->create();
        $a = TaskSection::create(['project_id' => $project->id, 'name' => 'A', 'position' => 0]);
        $b = TaskSection::create(['project_id' => $project->id, 'name' => 'B', 'position' => 1]);

        $this->actingAs($user)
            ->postJson("/projects/{$project->id}/sections/reorder", ['sections' => [
                ['id' => $b->id, 'position' => 0],
                ['id' => $a->id, 'position' => 1],
            ]])
            ->assertOk();

        Event::assertDispatched(TaskSectionUpdated::class, function ($e) use ($b) {
            // The whole list travels, in its new order — the receiving end has
            // no moves to replay.
            return $e->changeType === 'reordered'
                && count($e->sections) === 2
                && $e->sections[0]['id'] === $b->id;
        });
    }

    public function test_the_event_carries_the_project_channel(): void
    {
        $event = new TaskSectionUpdated(7, ['id' => 1], 'updated', 1);

        $this->assertSame('section.updated', $event->broadcastAs());
        $this->assertSame('private-project.7', $event->broadcastOn()[0]->name);
    }
}
