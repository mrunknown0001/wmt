<?php

namespace Tests\Feature;

use App\Models\ApprovalCustomField;
use App\Models\ApprovalItem;
use App\Models\ApprovalProject;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

/** The approval module must not answer to people with no standing in a project. */
class ApprovalAuthGapTest extends TestCase
{
    use RefreshDatabase;

    private function person(bool $approver = true): User
    {
        foreach (['manage-approval-projects', 'view-approval-projects'] as $p) {
            Permission::findOrCreate($p);
        }
        return User::factory()->create(['is_active' => true, 'can_approve' => $approver]);
    }

    public function test_custom_field_definitions_are_not_readable_by_a_stranger(): void
    {
        $owner = $this->person();
        $project = ApprovalProject::create(['name' => 'Audit project', 'owner_id' => $owner->id, 'status' => 'active']);
        ApprovalCustomField::create([
            'approval_project_id' => $project->id,
            'name' => 'Secret Budget Code',
            'type' => 'text',
            'position' => 1,
        ]);

        $r = $this->actingAs($this->person())
            ->getJson("/approval-projects/{$project->id}/custom-fields");

        $this->assertContains($r->status(), [403, 404], 'stranger got HTTP '.$r->status());
        $r->assertDontSee('Secret Budget Code');
    }

    public function test_the_owner_can_still_read_the_definitions(): void
    {
        $owner = $this->person();
        $project = ApprovalProject::create(['name' => 'Audit project', 'owner_id' => $owner->id, 'status' => 'active']);

        $this->actingAs($owner)
            ->getJson("/approval-projects/{$project->id}/custom-fields")
            ->assertSuccessful();
    }

    public function test_a_project_member_can_still_read_the_definitions(): void
    {
        $owner = $this->person();
        $project = ApprovalProject::create(['name' => 'Audit project', 'owner_id' => $owner->id, 'status' => 'active']);
        $member = $this->person();
        $project->members()->attach($member->id, ['role' => 'member']);

        // Reading field definitions is what filling in a request needs; the
        // fix must not have narrowed that to project managers.
        $this->actingAs($member)
            ->getJson("/approval-projects/{$project->id}/custom-fields")
            ->assertSuccessful();
    }

    public function test_an_item_cannot_be_read_through_another_projects_url(): void
    {
        $owner = $this->person();
        $a = ApprovalProject::create(['name' => 'Audit project', 'owner_id' => $owner->id, 'status' => 'active']);
        $b = ApprovalProject::create(['name' => 'Audit project', 'owner_id' => $owner->id, 'status' => 'active']);
        $item = ApprovalItem::create([
            'approval_project_id' => $b->id, 'requested_by' => $owner->id,
            'title' => 'Item in B', 'status' => 'pending',
        ]);

        // The owner may read both projects, so only the mismatch can refuse.
        $this->actingAs($owner)
            ->get("/approval-projects/{$a->id}/items/{$item->id}")
            ->assertStatus(404);
    }

    public function test_a_stranger_cannot_read_an_approval_item(): void
    {
        $owner = $this->person();
        $project = ApprovalProject::create(['name' => 'Audit project', 'owner_id' => $owner->id, 'status' => 'active']);
        $item = ApprovalItem::create([
            'approval_project_id' => $project->id, 'requested_by' => $owner->id,
            'title' => 'Private request', 'status' => 'pending',
        ]);

        $r = $this->actingAs($this->person())
            ->get("/approval-projects/{$project->id}/items/{$item->id}");
        $this->assertContains($r->status(), [403, 404], 'stranger got HTTP '.$r->status());
    }
}
