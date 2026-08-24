<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The sidebar must not offer a page the server will refuse.
 *
 * Each entry is hidden behind a condition in AuthenticatedLayout, and that
 * condition is only as good as two things staying true: the flag it reads is
 * actually shared with the front end, and the route still refuses whoever the
 * flag is meant to keep out. Either can drift silently — a renamed prop makes
 * the guard read `undefined`, and a route that loses its gate starts admitting
 * people the sidebar is still hiding it from.
 *
 * These lock both halves so a link and its gate cannot come apart unnoticed.
 */
class NavigationAccessTest extends TestCase
{
    use RefreshDatabase;

    /** Someone with the default role and nothing else. */
    private function ordinaryUser(): User
    {
        $this->seed(\Database\Seeders\RolePermissionSeeder::class);

        $user = User::factory()->create(['is_active' => true]);
        $user->syncRoles(['user']);
        $user->forceFill(['can_request' => false, 'can_approve' => false])->save();

        return $user;
    }

    /**
     * Every capability the sidebar reads has to reach the front end, or its
     * guard silently evaluates undefined.
     */
    public function test_the_capability_flags_the_sidebar_reads_are_shared(): void
    {
        $user = $this->ordinaryUser();

        $props = $this->actingAs($user)->get('/dashboard')
            ->assertOk()
            ->viewData('page')['props'];

        foreach (['can_request', 'can_approve', 'is_org_head', 'roles', 'permissions'] as $flag) {
            $this->assertArrayHasKey(
                $flag,
                $props['auth']['user'],
                "AuthenticatedLayout gates a nav item on auth.user.{$flag}; without it the guard reads undefined."
            );
        }
    }

    /**
     * The routes behind the guarded entries must actually refuse this person.
     *
     * If one of these starts returning 200, the sidebar is hiding a page the
     * user is in fact allowed to open — the mirror image of the problem, and
     * just as worth knowing about.
     */
    public function test_guarded_pages_refuse_an_ordinary_user(): void
    {
        $user = $this->ordinaryUser();

        $guarded = [
            '/my-requests'          => 'needs the Can Request capability',
            '/workload'             => 'needs view-workload',
            '/reports'              => 'needs view-reports',
            '/users'                => 'needs view-users',
            '/settings'             => 'admin only',
            '/trash'                => 'admin only',
            '/activity-log'         => 'admin only',
            '/my-personnel'         => 'needs an org scope',
            '/task-delegations'     => 'needs an org scope',
            '/executive-dashboard'  => 'admin, executive or org head',
        ];

        foreach ($guarded as $path => $why) {
            $status = $this->actingAs($user)->get($path)->status();

            $this->assertContains(
                $status,
                [403, 302],
                "GET {$path} returned {$status} for an ordinary user, but the sidebar hides it because it {$why}."
            );
        }
    }

    /** The pages every user is offered must actually open for them. */
    public function test_ungated_pages_open_for_an_ordinary_user(): void
    {
        $user = $this->ordinaryUser();

        foreach (['/dashboard', '/my-tasks', '/calendar', '/inbox', '/links', '/settings/password'] as $path) {
            $this->actingAs($user)->get($path)->assertOk();
        }
    }
}
