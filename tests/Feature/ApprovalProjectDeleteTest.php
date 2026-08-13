<?php

namespace Tests\Feature;

use App\Models\ApprovalProject;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Archiving or deleting an approval project pulls its pending items out of the
 * approver's queue; a permanent delete removes the project and every item under
 * it — even though items and step instances sit behind restrictOnDelete FKs.
 */
class ApprovalProjectDeleteTest extends TestCase
{
    use RefreshDatabase;

    private function approverAdmin(): User
    {
        Permission::findOrCreate('manage-approval-projects');
        Permission::findOrCreate('view-approval-projects');
        Role::findOrCreate('admin')->givePermissionTo(['manage-approval-projects', 'view-approval-projects']);

        $user = User::factory()->create(['is_active' => true, 'can_approve' => true]);
        $user->assignRole('admin');

        return $user;
    }

    /** A plain approver — can see the queue, but manages nothing. */
    private function plainApprover(): User
    {
        Permission::findOrCreate('view-approval-projects');
        $user = User::factory()->create(['is_active' => true, 'can_approve' => true]);
        $user->givePermissionTo('view-approval-projects');

        return $user;
    }

    /**
     * A project with one pending item on an active step where $approver is the
     * eligible approver. The item pins a chain version (restrictOnDelete) and the
     * instance pins a step (restrictOnDelete) — the two guards a force-delete must
     * clear.
     *
     * @return array{projectId:int, itemId:int, instanceId:int, stepId:int, versionId:int}
     */
    private function seedPending(User $approver, int $ownerId): array
    {
        $now = now();

        $projectId = DB::table('approval_projects')->insertGetId([
            'name' => 'Requests', 'status' => 'active', 'owner_id' => $ownerId,
            'created_at' => $now, 'updated_at' => $now,
        ]);
        $chainId = DB::table('approval_chains')->insertGetId([
            'approval_project_id' => $projectId, 'name' => 'Default',
            'created_at' => $now, 'updated_at' => $now,
        ]);
        $versionId = DB::table('approval_chain_versions')->insertGetId([
            'approval_chain_id' => $chainId, 'version_number' => 1, 'is_current' => true,
            'created_at' => $now, 'updated_at' => $now,
        ]);
        $stepId = DB::table('approval_steps')->insertGetId([
            'approval_chain_version_id' => $versionId, 'step_number' => 1,
            'name' => 'Review', 'approver_type' => 'specific_user',
            'created_at' => $now, 'updated_at' => $now,
        ]);
        $itemId = DB::table('approval_items')->insertGetId([
            'approval_project_id' => $projectId, 'approval_chain_version_id' => $versionId,
            'title' => 'Item', 'status' => 'pending', 'requested_by' => $approver->id,
            'current_step_number' => 1, 'submitted_at' => $now,
            'created_at' => $now, 'updated_at' => $now,
        ]);
        $instanceId = DB::table('approval_step_instances')->insertGetId([
            'approval_item_id' => $itemId, 'approval_step_id' => $stepId, 'step_number' => 1,
            'status' => 'active', 'activated_at' => $now,
            'created_at' => $now, 'updated_at' => $now,
        ]);
        DB::table('approval_step_instance_approvers')->insert([
            'approval_step_instance_id' => $instanceId, 'user_id' => $approver->id,
            'created_at' => $now, 'updated_at' => $now,
        ]);

        return compact('projectId', 'itemId', 'instanceId', 'stepId', 'versionId');
    }

    private function assertPendingCount(User $user, int $expected): void
    {
        $this->actingAs($user)
            ->get('/my-approvals')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('stats.pending', $expected)
                ->where('pendingApprovalsCount', $expected));
    }

    // ---- visibility ----

    public function test_a_pending_item_shows_in_the_inbox_and_count(): void
    {
        $user = $this->approverAdmin();
        $this->seedPending($user, $user->id);

        $this->assertPendingCount($user, 1);
    }

    public function test_archiving_hides_the_pending_item(): void
    {
        $user = $this->approverAdmin();
        $seed = $this->seedPending($user, $user->id);

        $this->actingAs($user)
            ->patch("/approval-projects/{$seed['projectId']}/archive")
            ->assertRedirect();

        $this->assertPendingCount($user, 0);
    }

    public function test_soft_deleting_hides_the_pending_item(): void
    {
        $user = $this->approverAdmin();
        $seed = $this->seedPending($user, $user->id);

        $this->actingAs($user)
            ->delete("/approval-projects/{$seed['projectId']}")
            ->assertRedirect();

        // The item row is untouched (soft-deleting a project doesn't delete items)…
        $this->assertDatabaseHas('approval_items', ['id' => $seed['itemId'], 'deleted_at' => null]);
        // …but it no longer shows to the approver.
        $this->assertPendingCount($user, 0);
    }

    public function test_restoring_brings_the_pending_item_back(): void
    {
        $user = $this->approverAdmin();
        $seed = $this->seedPending($user, $user->id);

        $this->actingAs($user)->delete("/approval-projects/{$seed['projectId']}")->assertRedirect();
        $this->assertPendingCount($user, 0);

        $this->actingAs($user)
            ->patch("/approval-projects/{$seed['projectId']}/restore")
            ->assertRedirect();

        $this->assertPendingCount($user, 1);
    }

    // ---- permanent delete ----

    public function test_permanent_delete_removes_the_project_and_all_items(): void
    {
        $user = $this->approverAdmin();
        $seed = $this->seedPending($user, $user->id);

        $this->actingAs($user)->delete("/approval-projects/{$seed['projectId']}")->assertRedirect();

        // Not blocked by the restrictOnDelete FKs (items→chain_versions, instances→steps).
        $this->actingAs($user)
            ->delete("/approval-projects/{$seed['projectId']}/force")
            ->assertRedirect();

        $this->assertNull(ApprovalProject::withTrashed()->find($seed['projectId']));
        $this->assertDatabaseMissing('approval_items', ['id' => $seed['itemId']]);
        $this->assertDatabaseMissing('approval_step_instances', ['id' => $seed['instanceId']]);
        $this->assertDatabaseMissing('approval_steps', ['id' => $seed['stepId']]);
        $this->assertDatabaseMissing('approval_chain_versions', ['id' => $seed['versionId']]);
        $this->assertSame(0, DB::table('approval_step_instance_approvers')->count());
    }

    public function test_a_non_manager_cannot_permanently_delete(): void
    {
        $admin = $this->approverAdmin();
        $seed = $this->seedPending($admin, $admin->id);
        $this->actingAs($admin)->delete("/approval-projects/{$seed['projectId']}")->assertRedirect();

        $outsider = $this->plainApprover();

        $this->actingAs($outsider)
            ->delete("/approval-projects/{$seed['projectId']}/force")
            ->assertForbidden();

        $this->assertNotNull(ApprovalProject::withTrashed()->find($seed['projectId']));
    }
}
