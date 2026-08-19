<?php

namespace Tests\Feature;

use App\Models\ApprovalItem;
use App\Models\ApprovalItemAttachment;
use App\Models\ApprovalItemShare;
use App\Models\ApprovalProject;
use App\Models\User;
use App\Notifications\ApprovalItemSharedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Handing a decided request to people who were not part of it: the grant, the
 * notification, and the access to detail and attachments that comes with it.
 */
class ApprovalItemShareTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function project(?User $owner = null): ApprovalProject
    {
        return ApprovalProject::create([
            'name' => 'Requests',
            'status' => 'active',
            'owner_id' => $owner?->id,
        ]);
    }

    private function item(ApprovalProject $project, User $requester, string $status = 'approved'): ApprovalItem
    {
        return ApprovalItem::create([
            'approval_project_id' => $project->id,
            'title' => 'Expense claim',
            'requested_by' => $requester->id,
            'status' => $status,
        ]);
    }

    private function shareUrl(ApprovalItem $item): string
    {
        return "/approval-projects/{$item->approval_project_id}/items/{$item->id}/shares";
    }

    // ------------------------------------------------------------ the grant

    public function test_the_requester_can_share_an_approved_request_with_several_people(): void
    {
        $requester = User::factory()->create();
        $a = User::factory()->create(['is_active' => true]);
        $b = User::factory()->create(['is_active' => true]);
        $item = $this->item($this->project(), $requester);

        $this->actingAs($requester)
            ->post($this->shareUrl($item), ['user_ids' => [$a->id, $b->id]])
            ->assertRedirect();

        $this->assertTrue($item->shares()->where('user_id', $a->id)->exists());
        $this->assertTrue($item->shares()->where('user_id', $b->id)->exists());
    }

    public function test_a_share_lets_the_recipient_open_the_request(): void
    {
        $requester = User::factory()->create();
        $outsider = User::factory()->create(['is_active' => true]);
        $item = $this->item($this->project(), $requester);

        // Nothing else connects them to it.
        $this->assertFalse($outsider->can('view', $item));

        ApprovalItemShare::create([
            'approval_item_id' => $item->id,
            'user_id' => $outsider->id,
            'shared_by' => $requester->id,
        ]);

        $this->assertTrue($outsider->fresh()->can('view', $item->fresh()));
    }

    public function test_a_share_carries_the_attachments_with_it(): void
    {
        // The point of the feature: the recipient can open the files, not just
        // the detail. Attachment reads authorize against the same ability.
        Storage::fake(ApprovalItemAttachment::DISK);

        $requester = User::factory()->create();
        $outsider = User::factory()->create(['is_active' => true]);
        $item = $this->item($this->project(), $requester);

        ApprovalItemAttachment::disk()->put('approval-items/1/receipt.pdf', 'pdf-bytes');
        $attachment = $item->attachments()->create([
            'file_name' => 'receipt.pdf',
            'file_path' => 'approval-items/1/receipt.pdf',
            'file_type' => 'application/pdf',
            'file_size' => 9,
        ]);

        $this->actingAs($outsider)->get(route('attachments.approval-item', $attachment))->assertForbidden();

        ApprovalItemShare::create([
            'approval_item_id' => $item->id,
            'user_id' => $outsider->id,
            'shared_by' => $requester->id,
        ]);

        $this->actingAs($outsider)->get(route('attachments.approval-item', $attachment))->assertOk();
    }

    public function test_removing_a_share_revokes_the_access(): void
    {
        $requester = User::factory()->create();
        $outsider = User::factory()->create(['is_active' => true]);
        $item = $this->item($this->project(), $requester);
        ApprovalItemShare::create([
            'approval_item_id' => $item->id, 'user_id' => $outsider->id, 'shared_by' => $requester->id,
        ]);

        $this->actingAs($requester)
            ->delete($this->shareUrl($item) . "/{$outsider->id}")
            ->assertRedirect();

        $this->assertFalse($outsider->fresh()->can('view', $item->fresh()));
    }

    // --------------------------------------------------------- notification

    public function test_recipients_are_notified(): void
    {
        $requester = User::factory()->create();
        $recipient = User::factory()->create(['is_active' => true]);
        $item = $this->item($this->project(), $requester);

        $this->actingAs($requester)->post($this->shareUrl($item), ['user_ids' => [$recipient->id]]);

        Notification::assertSentTo($recipient, ApprovalItemSharedNotification::class);
    }

    public function test_resharing_with_the_same_person_does_not_notify_again(): void
    {
        $requester = User::factory()->create();
        $recipient = User::factory()->create(['is_active' => true]);
        $item = $this->item($this->project(), $requester);

        $this->actingAs($requester)->post($this->shareUrl($item), ['user_ids' => [$recipient->id]]);
        $this->actingAs($requester)->post($this->shareUrl($item), ['user_ids' => [$recipient->id]]);

        Notification::assertSentToTimes($recipient, ApprovalItemSharedNotification::class, 1);
        $this->assertSame(1, $item->shares()->where('user_id', $recipient->id)->count());
    }

    public function test_the_requester_and_the_sharer_are_never_recipients(): void
    {
        $requester = User::factory()->create(['is_active' => true]);
        $admin = User::factory()->create(['is_active' => true]);
        $project = $this->project($admin);
        $item = $this->item($project, $requester);

        $this->actingAs($admin)->post($this->shareUrl($item), ['user_ids' => [$requester->id, $admin->id]]);

        Notification::assertNothingSent();
        $this->assertSame(0, $item->shares()->count());
    }

    public function test_an_inactive_person_is_skipped_rather_than_failing_the_share(): void
    {
        $requester = User::factory()->create();
        $active = User::factory()->create(['is_active' => true]);
        $leaver = User::factory()->create(['is_active' => false]);
        $item = $this->item($this->project(), $requester);

        $this->actingAs($requester)
            ->post($this->shareUrl($item), ['user_ids' => [$active->id, $leaver->id]])
            ->assertRedirect();

        $this->assertTrue($item->shares()->where('user_id', $active->id)->exists());
        $this->assertFalse($item->shares()->where('user_id', $leaver->id)->exists());
    }

    // ------------------------------------------------------- who may share

    public function test_a_request_still_in_flight_cannot_be_shared(): void
    {
        $requester = User::factory()->create();
        $other = User::factory()->create(['is_active' => true]);
        $item = $this->item($this->project(), $requester, 'pending');

        $this->actingAs($requester)
            ->post($this->shareUrl($item), ['user_ids' => [$other->id]])
            ->assertForbidden();
    }

    public function test_a_share_recipient_cannot_share_it_onwards(): void
    {
        // Otherwise access spreads a forward at a time with nobody able to see
        // how far it has reached.
        $requester = User::factory()->create();
        $recipient = User::factory()->create(['is_active' => true]);
        $third = User::factory()->create(['is_active' => true]);
        $item = $this->item($this->project(), $requester);
        ApprovalItemShare::create([
            'approval_item_id' => $item->id, 'user_id' => $recipient->id, 'shared_by' => $requester->id,
        ]);

        $this->actingAs($recipient)
            ->post($this->shareUrl($item), ['user_ids' => [$third->id]])
            ->assertForbidden();
    }

    public function test_the_project_owner_can_share(): void
    {
        $requester = User::factory()->create();
        $owner = User::factory()->create(['is_active' => true]);
        $recipient = User::factory()->create(['is_active' => true]);
        $item = $this->item($this->project($owner), $requester);

        $this->actingAs($owner)
            ->post($this->shareUrl($item), ['user_ids' => [$recipient->id]])
            ->assertRedirect();

        $this->assertTrue($item->shares()->where('user_id', $recipient->id)->exists());
    }
}
