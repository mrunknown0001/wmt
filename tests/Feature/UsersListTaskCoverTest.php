<?php

namespace Tests\Feature;

use App\Models\Task;
use App\Models\Project;
use App\Models\TaskDelegation;
use App\Models\User;
use App\Services\TaskDelegationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Task cover surfaced on the Users list: a column saying who is covered, and a
 * row action that opens the cover form already pointed at that person.
 */
class UsersListTaskCoverTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $away;
    private User $standIn;

    protected function setUp(): void
    {
        parent::setUp();

        Notification::fake();

        foreach (['manage-users', 'view-users'] as $name) {
            Permission::findOrCreate($name);
        }
        Role::findOrCreate('admin')->syncPermissions(['manage-users', 'view-users']);

        $this->admin = User::factory()->create(['name' => 'Admin', 'is_active' => true]);
        $this->admin->assignRole('admin');

        $this->away = User::factory()->create(['name' => 'Away Person', 'is_active' => true]);
        $this->standIn = User::factory()->create(['name' => 'Stand In', 'is_active' => true]);
    }

    /** @param  array<int, User>  $delegates */
    private function cover(string $from, string $to, array $delegates = []): TaskDelegation
    {
        $delegation = TaskDelegation::create([
            'user_id' => $this->away->id,
            'starts_on' => now()->modify($from)->toDateString(),
            'ends_on' => now()->modify($to)->toDateString(),
            'status' => TaskDelegation::SCHEDULED,
        ]);

        foreach (array_values($delegates ?: [$this->standIn]) as $i => $delegate) {
            $delegation->delegates()->attach($delegate->id, ['position' => $i]);
        }

        return $delegation->fresh('delegates');
    }

    private function coverRows(array $props): array
    {
        return $props['cover'] ?? [];
    }

    public function test_somebody_with_no_cover_has_no_row(): void
    {
        $this->actingAs($this->admin)
            ->get('/users')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('cover', []));
    }

    public function test_running_cover_shows_against_the_person_who_is_away(): void
    {
        TaskDelegationService::activate($this->cover('-1 day', '+5 days'));

        $this->actingAs($this->admin)
            ->get('/users')
            ->assertOk()
            ->assertInertia(function ($page) {
                $rows = $this->coverRows($page->toArray()['props']);

                $this->assertCount(1, $rows);
                $this->assertSame($this->away->id, $rows[0]['user_id']);
                $this->assertTrue($rows[0]['running']);
                $this->assertSame(['Stand In'], $rows[0]['delegates']);
            });
    }

    public function test_cover_that_has_not_started_yet_shows_as_upcoming(): void
    {
        $this->cover('+3 days', '+9 days');

        $this->actingAs($this->admin)
            ->get('/users')
            ->assertOk()
            ->assertInertia(function ($page) {
                $rows = $this->coverRows($page->toArray()['props']);

                $this->assertCount(1, $rows);
                $this->assertFalse($rows[0]['running']);
            });
    }

    public function test_finished_cover_is_not_shown(): void
    {
        $delegation = $this->cover('-10 days', '-2 days');
        TaskDelegationService::activate($delegation);
        TaskDelegationService::restore($delegation);

        $this->actingAs($this->admin)
            ->get('/users')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('cover', []));
    }

    public function test_both_stand_ins_are_listed(): void
    {
        $other = User::factory()->create(['name' => 'Second Cover', 'is_active' => true]);
        TaskDelegationService::activate($this->cover('-1 day', '+5 days', [$this->standIn, $other]));

        $this->actingAs($this->admin)
            ->get('/users')
            ->assertOk()
            ->assertInertia(function ($page) {
                $rows = $this->coverRows($page->toArray()['props']);

                $this->assertSame(['Stand In', 'Second Cover'], $rows[0]['delegates']);
            });
    }

    public function test_the_action_is_offered_to_an_administrator(): void
    {
        $this->actingAs($this->admin)
            ->get('/users')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('canArrangeCover', true));
    }

    public function test_the_action_is_hidden_from_somebody_who_could_not_use_it(): void
    {
        // Sees the list through view-users, but heads nothing and is neither an
        // admin nor an executive — the cover page would refuse them, so the row
        // action must not appear.
        $viewer = User::factory()->create(['is_active' => true]);
        $viewer->givePermissionTo('view-users');

        $this->actingAs($viewer)
            ->get('/users')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('canArrangeCover', false));
    }

    // ---- the pre-filled form ----

    public function test_the_row_action_opens_the_form_on_that_person(): void
    {
        $this->actingAs($this->admin)
            ->get("/task-delegations?for={$this->away->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('preselectUserId', $this->away->id));
    }

    public function test_no_preselection_without_the_parameter(): void
    {
        $this->actingAs($this->admin)
            ->get('/task-delegations')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('preselectUserId', null));
    }

    public function test_a_person_outside_your_scope_cannot_be_preselected(): void
    {
        // A team leader arrives with an id they are not responsible for.
        $team = \App\Models\Team::create([
            'name' => 'Frontline',
            'department_id' => \App\Models\Department::create([
                'name' => 'Support',
                'division_id' => \App\Models\Division::create(['name' => 'Field'])->id,
            ])->id,
        ]);

        $leader = User::factory()->create(['is_active' => true]);
        $team->update(['leader_id' => $leader->id]);

        $this->actingAs($leader)
            ->get("/task-delegations?for={$this->away->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('preselectUserId', null));
    }

    public function test_a_garbage_parameter_is_ignored(): void
    {
        $this->actingAs($this->admin)
            ->get('/task-delegations?for=not-a-number')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('preselectUserId', null));
    }

    /**
     * Cover is looked up for the current page of results, not the whole table.
     *
     * The filler is named so it sorts after everyone real, which puts the
     * covered person on page one and the rest on page two — otherwise the
     * assertion would pass on an empty list and prove nothing.
     */
    public function test_only_people_on_this_page_are_looked_up(): void
    {
        User::factory()->count(25)->sequence(fn ($s) => ['name' => 'Zz Filler ' . $s->index])
            ->create(['is_active' => true]);

        $delegation = $this->cover('-1 day', '+5 days');
        TaskDelegationService::activate($delegation);

        // Someone on page two is also away.
        $lateInTheAlphabet = User::where('name', 'Zz Filler 24')->first();
        $second = TaskDelegation::create([
            'user_id' => $lateInTheAlphabet->id,
            'starts_on' => now()->subDay()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
            'status' => TaskDelegation::ACTIVE,
        ]);
        $second->delegates()->attach($this->standIn->id, ['position' => 0]);

        $this->actingAs($this->admin)
            ->get('/users')
            ->assertOk()
            ->assertInertia(function ($page) {
                $rows = $this->coverRows($page->toArray()['props']);

                $this->assertCount(1, $rows);
                $this->assertSame($this->away->id, $rows[0]['user_id']);
            });

        // And page two carries its own.
        $this->actingAs($this->admin)
            ->get('/users?page=2')
            ->assertOk()
            ->assertInertia(function ($page) use ($lateInTheAlphabet) {
                $rows = $this->coverRows($page->toArray()['props']);

                $this->assertCount(1, $rows);
                $this->assertSame($lateInTheAlphabet->id, $rows[0]['user_id']);
            });
    }
}
