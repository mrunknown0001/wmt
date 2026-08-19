<?php

namespace Tests\Feature;

use App\Models\Setting;
use App\Models\Task;
use App\Models\User;
use App\Notifications\TaskAssignedNotification;
use App\Notifications\CommentDeletedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Tests\TestCase;

/**
 * Which channels a notification goes out on, given the two gates that govern
 * email: the administrator's system-wide switch and the recipient's own
 * preference. Mail needs both; database and broadcast need neither.
 */
class NotificationEmailPreferenceTest extends TestCase
{
    use RefreshDatabase;

    private function notification(): TaskAssignedNotification
    {
        // via() never touches either model, so unsaved instances are enough and
        // the test stays free of project/task fixtures.
        return new TaskAssignedNotification(new Task(), new User());
    }

    private function channels(User $user): array
    {
        return $this->notification()->via($user);
    }

    /**
     * Setting::current() is remembered forever, so a saved change is invisible
     * until the cache is dropped — exactly as SettingController does after an
     * administrator edits them.
     */
    private function setSystemChannel(string $key, bool $enabled): void
    {
        $settings = Setting::current();
        $settings->notification_channels = array_merge(
            $settings->getNotificationChannels(),
            [$key => $enabled],
        );
        $settings->save();

        Setting::clearCache();
    }

    public function test_email_is_sent_when_the_admin_allows_it_and_the_user_wants_it(): void
    {
        $user = User::factory()->create(['notification_preferences' => null]);

        $this->assertContains('mail', $this->channels($user));
    }

    public function test_a_user_can_turn_off_an_email_the_admin_allows(): void
    {
        $user = User::factory()->create([
            'notification_preferences' => ['email_task_assigned' => false],
        ]);

        $this->assertNotContains('mail', $this->channels($user));
    }

    public function test_a_user_cannot_turn_on_an_email_the_admin_has_disabled(): void
    {
        // The administrator's switch is the outer gate — a personal preference
        // must not be able to re-enable something switched off system-wide.
        $this->setSystemChannel('email_task_assigned', false);

        $user = User::factory()->create([
            'notification_preferences' => ['email_task_assigned' => true],
        ]);

        $this->assertNotContains('mail', $this->channels($user));
    }

    public function test_opting_out_of_email_still_leaves_the_in_app_notification(): void
    {
        $user = User::factory()->create([
            'notification_preferences' => ['email_task_assigned' => false],
        ]);

        $channels = $this->channels($user);

        $this->assertContains('database', $channels);
        $this->assertContains('broadcast', $channels);
    }

    public function test_a_preference_for_one_type_does_not_affect_another(): void
    {
        $user = User::factory()->create([
            'notification_preferences' => ['email_task_assigned' => false],
        ]);

        // comment_deleted defaults to off system-wide, so enable it to check that
        // the unrelated opt-out above has not leaked across types.
        $this->setSystemChannel('email_comment_deleted', true);

        $user->notification_preferences = array_merge(
            $user->notification_preferences,
            ['email_comment_deleted' => true],
        );
        $user->save();

        $deleted = new CommentDeletedNotification(new Task(), new User(), 'a comment');

        $this->assertContains('mail', $deleted->via($user));
    }

    public function test_a_notifiable_that_is_not_a_user_keeps_whatever_the_admin_allows(): void
    {
        // An on-demand mail route has no preferences to consult; it must not be
        // suppressed as though it had opted out.
        $anonymous = new AnonymousNotifiable();

        $this->assertContains('mail', $this->notification()->via($anonymous));
    }
}
