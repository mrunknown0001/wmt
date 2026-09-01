<?php

namespace Tests\Feature;

use App\Models\Form;
use App\Models\Project;
use App\Models\User;
use App\Support\RichText;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

/**
 * A form's description and its questions' help text are rich text now, and they
 * are rendered as HTML on a page anybody with the link can open. So what an
 * author writes is filtered on the way in, and measured by what they typed
 * rather than by the markup around it.
 */
class FormRichTextTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        Permission::findOrCreate('manage-projects');
        Permission::findOrCreate('view-projects');
    }

    private function owner(): User
    {
        $user = User::factory()->create(['is_active' => true]);
        $user->givePermissionTo(['manage-projects', 'view-projects']);

        return $user;
    }

    private function postForm(User $user, Project $project, array $overrides = [])
    {
        return $this->actingAs($user)->post("/projects/{$project->id}/forms", array_merge([
            'name' => 'Intake',
            'submit_button_text' => 'Submit',
            'fields' => [[
                'type' => 'text',
                'label' => 'Your name',
                'position' => 0,
                'is_required' => false,
            ]],
        ], $overrides));
    }

    public function test_formatting_survives_but_scripts_do_not(): void
    {
        $user = $this->owner();
        $project = Project::create(['name' => 'P', 'status' => 'active', 'owner_id' => $user->id]);

        $this->postForm($user, $project, [
            'description' => '<p>Please read <strong>carefully</strong>.</p><script>alert(1)</script>',
        ])->assertSessionHasNoErrors();

        $form = Form::firstOrFail();

        $this->assertStringContainsString('<strong>carefully</strong>', $form->description);
        $this->assertStringNotContainsString('script', $form->description);
        $this->assertStringNotContainsString('alert(1)', $form->description);
    }

    public function test_an_event_handler_is_stripped_from_a_tag_that_is_kept(): void
    {
        $user = $this->owner();
        $project = Project::create(['name' => 'P', 'status' => 'active', 'owner_id' => $user->id]);

        $this->postForm($user, $project, [
            'description' => '<p onclick="steal()" class="x">Hello</p>',
        ])->assertSessionHasNoErrors();

        $description = Form::firstOrFail()->description;

        $this->assertStringContainsString('Hello', $description);
        $this->assertStringNotContainsString('onclick', $description);
        $this->assertStringNotContainsString('steal', $description);
    }

    public function test_a_javascript_link_loses_its_href_and_a_real_one_keeps_it(): void
    {
        $this->assertStringNotContainsString('javascript', RichText::sanitize('<a href="javascript:alert(1)">x</a>'));

        $safe = RichText::sanitize('<a href="https://example.com">x</a>');
        $this->assertStringContainsString('href="https://example.com"', $safe);
        // A link out of a public form should not hand the opener away.
        $this->assertStringContainsString('rel="noopener noreferrer nofollow"', $safe);
    }

    public function test_help_text_is_filtered_the_same_way(): void
    {
        $user = $this->owner();
        $project = Project::create(['name' => 'P', 'status' => 'active', 'owner_id' => $user->id]);

        $this->postForm($user, $project, [
            'fields' => [[
                'type' => 'text',
                'label' => 'Your name',
                'position' => 0,
                'is_required' => false,
                'help_text' => '<p>As it appears on your <em>ID</em></p><iframe src="//evil"></iframe>',
            ]],
        ])->assertSessionHasNoErrors();

        $help = Form::firstOrFail()->fields()->firstOrFail()->help_text;

        $this->assertStringContainsString('<em>ID</em>', $help);
        $this->assertStringNotContainsString('iframe', $help);
    }

    /** Plain text written before the editor existed must come back untouched. */
    public function test_plain_text_is_left_alone(): void
    {
        $this->assertSame("Line one\nLine two", RichText::sanitize("Line one\nLine two"));
        $this->assertNull(RichText::sanitize(null));
    }

    public function test_the_limit_counts_the_words_not_the_tags(): void
    {
        $user = $this->owner();
        $project = Project::create(['name' => 'P', 'status' => 'active', 'owner_id' => $user->id]);

        // 5,000 typed characters, and well over that once the tags are counted.
        $this->postForm($user, $project, [
            'description' => str_repeat('<p>'.str_repeat('a', 100).'</p>', 50),
        ])->assertSessionHasNoErrors();

        $this->postForm($user, $project, [
            'name' => 'Too long',
            'description' => '<p>'.str_repeat('a', 5001).'</p>',
        ])->assertSessionHasErrors('description');
    }

    public function test_a_question_help_text_has_its_own_smaller_limit(): void
    {
        $user = $this->owner();
        $project = Project::create(['name' => 'P', 'status' => 'active', 'owner_id' => $user->id]);

        $this->postForm($user, $project, [
            'fields' => [[
                'type' => 'text',
                'label' => 'Your name',
                'position' => 0,
                'is_required' => false,
                'help_text' => '<p>'.str_repeat('a', 1001).'</p>',
            ]],
        ])->assertSessionHasErrors('fields.0.help_text');
    }
}
