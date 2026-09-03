<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

/**
 * Which files a comment will carry.
 *
 * The list is deliberately short — a comment thread is not a file share — but
 * Word documents are what people actually attach to a task, and refusing them
 * sent everybody back to email.
 */
class CommentAttachmentTypeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        Storage::fake('local');
        Permission::findOrCreate('manage-tasks');
        Permission::findOrCreate('view-projects');
        Permission::findOrCreate('manage-projects');
    }

    private function task(): array
    {
        $user = User::factory()->create(['is_active' => true]);
        $user->givePermissionTo(['manage-tasks', 'view-projects', 'manage-projects']);

        $project = Project::create([
            'name' => 'Delivery',
            'status' => 'active',
            'owner_id' => $user->id,
        ]);

        $task = Task::create([
            'project_id' => $project->id,
            'title' => 'A task',
            'status' => 'to_do',
            'priority' => 'medium',
        ]);

        return [$user, $project, $task];
    }

    public function test_a_word_document_can_be_attached_to_a_comment(): void
    {
        [$user, $project, $task] = $this->task();

        $this->actingAs($user)
            ->post("/projects/{$project->id}/tasks/{$task->id}/comments", [
                'body' => 'Draft attached.',
                'attachments' => [
                    UploadedFile::fake()->create(
                        'scope.docx',
                        20,
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                    ),
                ],
            ])
            ->assertSessionHasNoErrors();

        $this->assertSame('scope.docx', $task->comments()->first()->attachments()->first()->file_name);
    }

    public function test_the_types_that_were_already_allowed_still_are(): void
    {
        [$user, $project, $task] = $this->task();

        $this->actingAs($user)
            ->post("/projects/{$project->id}/tasks/{$task->id}/comments", [
                'body' => 'Numbers and a picture.',
                'attachments' => [
                    UploadedFile::fake()->create('figures.xlsx', 20, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
                    UploadedFile::fake()->image('shot.png'),
                ],
            ])
            ->assertSessionHasNoErrors();

        $this->assertCount(2, $task->comments()->first()->attachments);
    }

    public function test_an_executable_is_still_refused(): void
    {
        [$user, $project, $task] = $this->task();

        $this->actingAs($user)
            ->post("/projects/{$project->id}/tasks/{$task->id}/comments", [
                'body' => 'Run this.',
                'attachments' => [UploadedFile::fake()->create('installer.exe', 20, 'application/octet-stream')],
            ])
            ->assertSessionHasErrors('attachments.0');

        $this->assertSame(0, $task->comments()->count());
    }
}
