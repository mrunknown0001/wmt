<?php

namespace Tests\Feature;

use App\Models\ApprovalForm;
use App\Models\ApprovalProject;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

/**
 * The approval form's description and help text, filtered and measured the same
 * way the project form's are — its public link is just as open.
 */
class ApprovalFormRichTextTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        Permission::findOrCreate('manage-approval-projects');
        Permission::findOrCreate('view-approval-projects');
    }

    private function owner(): User
    {
        $user = User::factory()->create(['is_active' => true]);
        $user->givePermissionTo(['manage-approval-projects', 'view-approval-projects']);

        return $user;
    }

    private function submitForm(User $user, ApprovalProject $project, array $overrides = [])
    {
        return $this->actingAs($user)->post("/approval-projects/{$project->id}/forms", array_merge([
            'name' => 'Purchase request',
            'fields' => [[
                'type' => 'text',
                'label' => 'What do you need?',
                'is_required' => false,
            ]],
        ], $overrides));
    }

    private function project(User $owner): ApprovalProject
    {
        return ApprovalProject::create([
            'name' => 'Approvals',
            'status' => 'active',
            'owner_id' => $owner->id,
        ]);
    }

    public function test_formatting_survives_but_scripts_do_not(): void
    {
        $user = $this->owner();
        $project = $this->project($user);

        $this->submitForm($user, $project, [
            'description' => '<p>Read <strong>this</strong> first.</p><script>alert(1)</script>',
        ])->assertSessionHasNoErrors();

        $description = ApprovalForm::firstOrFail()->description;

        $this->assertStringContainsString('<strong>this</strong>', $description);
        $this->assertStringNotContainsString('script', $description);
    }

    public function test_help_text_is_filtered_too(): void
    {
        $user = $this->owner();
        $project = $this->project($user);

        $this->submitForm($user, $project, [
            'fields' => [[
                'type' => 'text',
                'label' => 'What do you need?',
                'is_required' => false,
                'help_text' => '<p>Be <em>specific</em></p><iframe src="//evil"></iframe>',
            ]],
        ])->assertSessionHasNoErrors();

        $help = ApprovalForm::firstOrFail()->fields()->firstOrFail()->help_text;

        $this->assertStringContainsString('<em>specific</em>', $help);
        $this->assertStringNotContainsString('iframe', $help);
    }

    public function test_the_limits_count_the_words_not_the_tags(): void
    {
        $user = $this->owner();
        $project = $this->project($user);

        // 1,000 typed characters across ten paragraphs — over the limit only if
        // the markup is counted, which it no longer is.
        $this->submitForm($user, $project, [
            'description' => str_repeat('<p>'.str_repeat('a', 100).'</p>', 10),
        ])->assertSessionHasNoErrors();

        $this->submitForm($user, $project, [
            'name' => 'Too long',
            'description' => '<p>'.str_repeat('a', 1001).'</p>',
        ])->assertSessionHasErrors('description');
    }

    public function test_help_text_has_its_own_smaller_limit(): void
    {
        $user = $this->owner();
        $project = $this->project($user);

        $this->submitForm($user, $project, [
            'fields' => [[
                'type' => 'text',
                'label' => 'What do you need?',
                'is_required' => false,
                'help_text' => '<p>'.str_repeat('a', 501).'</p>',
            ]],
        ])->assertSessionHasErrors('fields.0.help_text');
    }
}
