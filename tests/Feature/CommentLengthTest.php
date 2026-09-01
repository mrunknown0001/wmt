<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Rules\CommentLength;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

/**
 * A comment is limited by what was typed, not by the markup around it.
 *
 * The rule used to be max:2000 on the stored HTML, so a comment of a few short
 * paragraphs spent hundreds of characters on <p> tags. The editor's counter
 * counts what a person types, and this is what makes that count honest.
 */
class CommentLengthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        Permission::findOrCreate('view-projects');
        Permission::findOrCreate('manage-tasks');
    }

    private function task(): array
    {
        $user = User::factory()->create(['is_active' => true]);
        $user->givePermissionTo(['view-projects', 'manage-tasks']);

        $project = Project::create(['name' => 'Chatty', 'status' => 'active', 'owner_id' => $user->id]);
        $task = Task::create([
            'project_id' => $project->id,
            'title' => 'Task',
            'status' => 'to_do',
            'priority' => 'medium',
            'created_by' => $user->id,
        ]);

        return [$user, $project, $task];
    }

    private function comment(User $user, Project $project, Task $task, string $body)
    {
        return $this->actingAs($user)
            ->post("/projects/{$project->id}/tasks/{$task->id}/comments", ['body' => $body]);
    }

    public function test_the_limit_counts_what_was_typed_not_the_markup(): void
    {
        [$user, $project, $task] = $this->task();

        // Twenty paragraphs of a hundred characters: 2,000 typed, and about
        // 2,140 once the tags are counted. The old rule refused this.
        $body = str_repeat('<p>'.str_repeat('a', 100).'</p>', 20);
        $this->assertGreaterThan(2000, mb_strlen($body));

        $this->comment($user, $project, $task, $body)->assertSessionHasNoErrors();
        $this->assertDatabaseCount('task_comments', 1);
    }

    public function test_one_character_too_many_is_still_refused(): void
    {
        [$user, $project, $task] = $this->task();

        $body = '<p>'.str_repeat('a', 2001).'</p>';

        $this->comment($user, $project, $task, $body)->assertSessionHasErrors('body');
        $this->assertDatabaseCount('task_comments', 0);
    }

    public function test_exactly_the_limit_is_accepted(): void
    {
        [$user, $project, $task] = $this->task();

        $this->comment($user, $project, $task, '<p>'.str_repeat('a', 2000).'</p>')
            ->assertSessionHasNoErrors();
        $this->assertDatabaseCount('task_comments', 1);
    }

    /** Markup is allowed to be generous, but not unbounded. */
    public function test_a_wall_of_markup_is_refused_even_with_little_text(): void
    {
        [$user, $project, $task] = $this->task();

        $body = str_repeat('<span class="'.str_repeat('x', 100).'">a</span>', 300);
        $this->assertGreaterThan(CommentLength::RAW, mb_strlen($body));

        $this->comment($user, $project, $task, $body)->assertSessionHasErrors('body');
        $this->assertDatabaseCount('task_comments', 0);
    }

    public function test_an_edit_is_measured_the_same_way(): void
    {
        [$user, $project, $task] = $this->task();

        $this->comment($user, $project, $task, '<p>first</p>')->assertSessionHasNoErrors();
        $comment = $task->comments()->firstOrFail();

        $this->actingAs($user)
            ->put("/projects/{$project->id}/tasks/{$task->id}/comments/{$comment->id}", [
                'body' => str_repeat('<p>'.str_repeat('b', 100).'</p>', 20),
            ])
            ->assertSessionHasNoErrors();

        $this->actingAs($user)
            ->put("/projects/{$project->id}/tasks/{$task->id}/comments/{$comment->id}", [
                'body' => '<p>'.str_repeat('b', 2001).'</p>',
            ])
            ->assertSessionHasErrors('body');
    }

    /**
     * The same measure the editor's counter uses: text, and nothing else.
     * Paragraph breaks cost nothing on either side, so the number on screen and
     * the number the server checks cannot disagree.
     */
    public function test_only_the_typed_characters_are_counted(): void
    {
        $this->assertSame(5, CommentLength::visibleLength('<p>hello</p>'));
        $this->assertSame(10, CommentLength::visibleLength('<p>hello</p><p>world</p>'));
        $this->assertSame(3, CommentLength::visibleLength('<p>a&amp;b</p>'));
        $this->assertSame(0, CommentLength::visibleLength('<p></p>'));
        // A mention is its visible name, not the span carrying the id.
        $this->assertSame(
            5,
            CommentLength::visibleLength('<p><span data-mention data-id="7">@adam</span></p>')
        );
    }
}
