<?php

namespace Tests\Feature;

use App\Models\ApprovalItem;
use App\Models\ApprovalItemComment;
use App\Models\ApprovalProject;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

/**
 * Approval comments are rich text now, so they are filtered on the way in and
 * measured by what was typed rather than by the markup around it — the same
 * treatment task comments and the form fields already have.
 */
class ApprovalCommentRichTextTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        Permission::findOrCreate('view-approval-projects');
    }

    /** @return array{User, ApprovalProject, ApprovalItem} */
    private function item(): array
    {
        $user = User::factory()->create(['is_active' => true]);
        $user->givePermissionTo('view-approval-projects');

        $project = ApprovalProject::create([
            'name' => 'Approvals',
            'status' => 'active',
            'owner_id' => $user->id,
        ]);

        $item = ApprovalItem::create([
            'approval_project_id' => $project->id,
            'title' => 'A request',
            'status' => 'draft',
            'requested_by' => $user->id,
        ]);

        return [$user, $project, $item];
    }

    private function comment(User $user, ApprovalProject $project, ApprovalItem $item, string $body)
    {
        return $this->actingAs($user)->post(
            "/approval-projects/{$project->id}/items/{$item->id}/comments",
            ['body' => $body]
        );
    }

    public function test_formatting_survives_but_scripts_do_not(): void
    {
        [$user, $project, $item] = $this->item();

        $this->comment($user, $project, $item, '<p>Approved, <strong>with conditions</strong>.</p><script>alert(1)</script>')
            ->assertSessionHasNoErrors();

        $body = ApprovalItemComment::firstOrFail()->body;

        $this->assertStringContainsString('<strong>with conditions</strong>', $body);
        $this->assertStringNotContainsString('script', $body);
    }

    public function test_the_limit_counts_what_was_typed_not_the_markup(): void
    {
        [$user, $project, $item] = $this->item();

        // 2,000 typed characters across twenty paragraphs, and more than that
        // once the tags are counted.
        $body = str_repeat('<p>'.str_repeat('a', 100).'</p>', 20);
        $this->assertGreaterThan(2000, mb_strlen($body));

        $this->comment($user, $project, $item, $body)->assertSessionHasNoErrors();
        $this->assertDatabaseCount('approval_item_comments', 1);
    }

    public function test_one_character_too_many_is_refused(): void
    {
        [$user, $project, $item] = $this->item();

        $this->comment($user, $project, $item, '<p>'.str_repeat('a', 2001).'</p>')
            ->assertSessionHasErrors('body');

        $this->assertDatabaseCount('approval_item_comments', 0);
    }

    public function test_an_edit_is_filtered_and_measured_the_same_way(): void
    {
        [$user, $project, $item] = $this->item();

        $this->comment($user, $project, $item, '<p>first</p>')->assertSessionHasNoErrors();
        $comment = ApprovalItemComment::firstOrFail();

        $this->actingAs($user)->put(
            "/approval-projects/{$project->id}/items/{$item->id}/comments/{$comment->id}",
            ['body' => '<p onclick="steal()">edited</p>']
        )->assertSessionHasNoErrors();

        $this->assertStringNotContainsString('onclick', $comment->fresh()->body);
        $this->assertStringContainsString('edited', $comment->fresh()->body);

        $this->actingAs($user)->put(
            "/approval-projects/{$project->id}/items/{$item->id}/comments/{$comment->id}",
            ['body' => '<p>'.str_repeat('b', 2001).'</p>']
        )->assertSessionHasErrors('body');
    }

    /** Comments written before the editor existed are left exactly as they are. */
    public function test_plain_text_is_stored_unchanged(): void
    {
        [$user, $project, $item] = $this->item();

        $this->comment($user, $project, $item, "Looks fine\nShipping it")->assertSessionHasNoErrors();

        $this->assertSame("Looks fine\nShipping it", ApprovalItemComment::firstOrFail()->body);
    }
}
