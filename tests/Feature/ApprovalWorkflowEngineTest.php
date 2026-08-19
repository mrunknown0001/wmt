<?php

namespace Tests\Feature;

use App\Models\ApprovalChain;
use App\Models\ApprovalChainVersion;
use App\Models\ApprovalItem;
use App\Models\ApprovalProject;
use App\Models\ApprovalStep;
use App\Models\ApprovalStepInstance;
use App\Models\User;
use App\Notifications\ApprovalRequestedNotification;
use App\Services\ApprovalWorkflowEngine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * The approval state machine: submit, collect decisions, evaluate quorum, then
 * progress, finalise, or apply the chain's rejection behaviour.
 *
 * These lean on the engine rather than on HTTP, because the interesting logic is
 * all below the controller — who a step resolves to, when a quorum is met, and
 * which of the three reject behaviours fires.
 */
class ApprovalWorkflowEngineTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Every activation notifies its approvers; none of these tests want mail.
        Notification::fake();
    }

    // ---------------------------------------------------------------- fixtures

    private function approver(): User
    {
        return User::factory()->create(['is_active' => true, 'can_approve' => true]);
    }

    /**
     * Deliberately ownerless. ApprovalApproverResolver falls back to the project
     * owner when a step resolves to nobody, so an owner here would quietly stop
     * the "step with no approvers" cases from testing anything.
     */
    private function project(): ApprovalProject
    {
        return ApprovalProject::create(['name' => 'Requests', 'status' => 'active']);
    }

    private function defaultChainVersion(ApprovalProject $project, string $onReject = 'reject_item'): ApprovalChainVersion
    {
        $chain = ApprovalChain::create([
            'approval_project_id' => $project->id,
            'name' => 'Standard',
            'is_default' => true,
            'is_active' => true,
            'priority' => 0,
            'on_reject_behavior' => $onReject,
        ]);

        return ApprovalChainVersion::create([
            'approval_chain_id' => $chain->id,
            'version_number' => 1,
            'is_current' => true,
        ]);
    }

    /** @param  array<int, User>  $approvers  empty means the step resolves to nobody */
    private function stepFor(ApprovalChainVersion $version, int $number, array $approvers, array $attributes = []): ApprovalStep
    {
        return ApprovalStep::create(array_merge([
            'approval_chain_version_id' => $version->id,
            'step_number' => $number,
            'name' => "Step {$number}",
            'approver_type' => 'group',
            'approver_config' => ['user_ids' => array_map(fn (User $u) => $u->id, $approvers)],
            'quorum_mode' => 'all',
        ], $attributes));
    }

    private function submitItem(ApprovalProject $project, ?User $requester = null): ApprovalItem
    {
        $item = ApprovalItem::create([
            'approval_project_id' => $project->id,
            'title' => 'Expense claim',
            'requested_by' => ($requester ?? $this->approver())->id,
            'status' => 'pending',
        ]);

        ApprovalWorkflowEngine::submit($item);

        return $item->fresh();
    }

    private function activeInstance(ApprovalItem $item): ?ApprovalStepInstance
    {
        return $item->stepInstances()->where('status', 'active')->first();
    }

    /** abort() raises a Symfony HttpException carrying the status we care about. */
    private function assertAborts(int $status, callable $callback): void
    {
        try {
            $callback();
        } catch (HttpException $e) {
            $this->assertSame($status, $e->getStatusCode());

            return;
        }

        $this->fail("Expected the engine to abort with {$status}, but it did not.");
    }

    // ------------------------------------------------------------------ submit

    public function test_submit_pins_the_chain_version_and_activates_the_first_step(): void
    {
        $approver = $this->approver();
        $project = $this->project();
        $version = $this->defaultChainVersion($project);
        $this->stepFor($version, 1, [$approver]);

        $item = $this->submitItem($project);

        $this->assertSame('pending', $item->status);
        $this->assertSame(1, $item->current_step_number);
        $this->assertNotNull($item->submitted_at);
        $this->assertSame($version->id, $item->approval_chain_version_id);

        $instance = $this->activeInstance($item);
        $this->assertNotNull($instance);
        $this->assertSame(1, $instance->step_number);
        $this->assertSame(1, $instance->attempt_number);
        $this->assertSame(1, $instance->quorum_required);
    }

    public function test_submit_snapshots_the_eligible_approvers_for_the_step(): void
    {
        [$first, $second] = [$this->approver(), $this->approver()];
        $outsider = $this->approver();

        $project = $this->project();
        $version = $this->defaultChainVersion($project);
        $this->stepFor($version, 1, [$first, $second]);

        $instance = $this->activeInstance($this->submitItem($project));

        $this->assertTrue($instance->approvers()->where('user_id', $first->id)->exists());
        $this->assertTrue($instance->approvers()->where('user_id', $second->id)->exists());
        $this->assertFalse($instance->approvers()->where('user_id', $outsider->id)->exists());
    }

    public function test_a_request_with_no_matching_chain_is_rejected_outright(): void
    {
        $project = $this->project(); // no chain at all

        $item = $this->submitItem($project);

        $this->assertSame('rejected', $item->status);
        $this->assertNull($item->approval_chain_version_id);
        $this->assertSame(0, $item->stepInstances()->count());
    }

    // ------------------------------------------------------------------ quorum

    public function test_quorum_of_all_waits_for_every_approver(): void
    {
        [$first, $second] = [$this->approver(), $this->approver()];
        $project = $this->project();
        $version = $this->defaultChainVersion($project);
        $this->stepFor($version, 1, [$first, $second], ['quorum_mode' => 'all']);

        $item = $this->submitItem($project);
        ApprovalWorkflowEngine::advance($item, 'approved', $first);

        $item->refresh();
        $this->assertSame('pending', $item->status, 'One of two approvals must not finalise an "all" step.');
        $this->assertNotNull($this->activeInstance($item));

        ApprovalWorkflowEngine::advance($item, 'approved', $second);

        $this->assertSame('approved', $item->fresh()->status);
    }

    public function test_quorum_of_any_completes_on_the_first_approval(): void
    {
        [$first, $second] = [$this->approver(), $this->approver()];
        $project = $this->project();
        $version = $this->defaultChainVersion($project);
        $this->stepFor($version, 1, [$first, $second], ['quorum_mode' => 'any']);

        $item = $this->submitItem($project);
        $this->assertSame(1, $this->activeInstance($item)->quorum_required);

        ApprovalWorkflowEngine::advance($item, 'approved', $first);

        $this->assertSame('approved', $item->fresh()->status);
    }

    public function test_majority_quorum_needs_more_than_half(): void
    {
        $approvers = [$this->approver(), $this->approver(), $this->approver()];
        $project = $this->project();
        $version = $this->defaultChainVersion($project);
        $this->stepFor($version, 1, $approvers, ['quorum_mode' => 'majority']);

        $item = $this->submitItem($project);
        $this->assertSame(2, $this->activeInstance($item)->quorum_required, 'Majority of 3 is 2.');

        ApprovalWorkflowEngine::advance($item, 'approved', $approvers[0]);
        $this->assertSame('pending', $item->fresh()->status);

        ApprovalWorkflowEngine::advance($item, 'approved', $approvers[1]);
        $this->assertSame('approved', $item->fresh()->status);
    }

    public function test_a_step_becomes_unreachable_once_too_many_approvers_have_refused(): void
    {
        // Two approvers, quorum "all": the first rejection makes the second
        // approval pointless, so the step should fail without waiting for it.
        [$first, $second] = [$this->approver(), $this->approver()];
        $project = $this->project();
        $version = $this->defaultChainVersion($project);
        $this->stepFor($version, 1, [$first, $second], ['quorum_mode' => 'all']);

        $item = $this->submitItem($project);
        ApprovalWorkflowEngine::advance($item, 'rejected', $first);

        $this->assertSame('rejected', $item->fresh()->status);
    }

    // ---------------------------------------------------------------- progress

    public function test_approving_a_step_activates_the_next_one(): void
    {
        [$first, $second] = [$this->approver(), $this->approver()];
        $project = $this->project();
        $version = $this->defaultChainVersion($project);
        $this->stepFor($version, 1, [$first]);
        $this->stepFor($version, 2, [$second]);

        $item = $this->submitItem($project);
        ApprovalWorkflowEngine::advance($item, 'approved', $first);
        $item->refresh();

        $this->assertSame('pending', $item->status);
        $this->assertSame(2, $item->current_step_number);

        $completed = $item->stepInstances()->where('step_number', 1)->first();
        $this->assertSame('approved', $completed->status);
        $this->assertNotNull($completed->completed_at);

        $this->assertSame(2, $this->activeInstance($item)->step_number);
    }

    public function test_approving_the_final_step_finalises_the_request(): void
    {
        $approver = $this->approver();
        $project = $this->project();
        $version = $this->defaultChainVersion($project);
        $this->stepFor($version, 1, [$approver]);

        $item = $this->submitItem($project);
        ApprovalWorkflowEngine::advance($item, 'approved', $approver);
        $item->refresh();

        $this->assertSame('approved', $item->status);
        $this->assertNotNull($item->decided_at);
        $this->assertNull($item->current_step_number, 'A settled request sits on no step.');
    }

    public function test_a_step_resolving_to_nobody_is_skipped(): void
    {
        $approver = $this->approver();
        $project = $this->project();
        $version = $this->defaultChainVersion($project);
        $this->stepFor($version, 1, []); // resolves to nobody
        $this->stepFor($version, 2, [$approver]);

        $item = $this->submitItem($project);

        $this->assertSame(2, $item->current_step_number);
        $this->assertSame(0, $item->stepInstances()->where('step_number', 1)->count());
        $this->assertSame(2, $this->activeInstance($item)->step_number);
    }

    public function test_a_chain_nobody_can_action_finalises_as_approved(): void
    {
        $project = $this->project();
        $version = $this->defaultChainVersion($project);
        $this->stepFor($version, 1, []);

        $item = $this->submitItem($project);

        $this->assertSame('approved', $item->status);
        $this->assertSame(0, $item->stepInstances()->count());
    }

    // ------------------------------------------------------- reject behaviours

    public function test_reject_item_is_the_default_rejection_behaviour(): void
    {
        $approver = $this->approver();
        $project = $this->project();
        $version = $this->defaultChainVersion($project, 'reject_item');
        $this->stepFor($version, 1, [$approver], ['quorum_mode' => 'any']);

        $item = $this->submitItem($project);
        ApprovalWorkflowEngine::advance($item, 'rejected', $approver);
        $item->refresh();

        $this->assertSame('rejected', $item->status);
        $this->assertNotNull($item->decided_at);
        $this->assertNull($item->current_step_number);
    }

    public function test_return_to_requester_sends_the_request_back_for_changes(): void
    {
        $approver = $this->approver();
        $project = $this->project();
        $version = $this->defaultChainVersion($project, 'return_to_requester');
        $this->stepFor($version, 1, [$approver], ['quorum_mode' => 'any']);

        $item = $this->submitItem($project);
        ApprovalWorkflowEngine::advance($item, 'rejected', $approver);
        $item->refresh();

        $this->assertSame('changes_requested', $item->status);
        $this->assertNull($item->current_step_number);
        $this->assertNull($item->decided_at, 'Sending back is not a final decision.');
        $this->assertNull($this->activeInstance($item), 'No step is waiting while it sits with the requester.');
    }

    public function test_return_to_previous_step_reopens_the_earlier_step_as_a_new_attempt(): void
    {
        [$first, $second] = [$this->approver(), $this->approver()];
        $project = $this->project();
        $version = $this->defaultChainVersion($project, 'return_to_previous_step');
        $this->stepFor($version, 1, [$first], ['quorum_mode' => 'any']);
        $this->stepFor($version, 2, [$second], ['quorum_mode' => 'any']);

        $item = $this->submitItem($project);
        ApprovalWorkflowEngine::advance($item, 'approved', $first);
        ApprovalWorkflowEngine::advance($item, 'rejected', $second);
        $item->refresh();

        $this->assertSame('pending', $item->status);
        $this->assertSame(1, $item->current_step_number);

        $reopened = $this->activeInstance($item);
        $this->assertSame(1, $reopened->step_number);
        $this->assertSame(2, $reopened->attempt_number, 'The earlier step reopens as a fresh attempt.');

        // The first attempt is left in place as history rather than overwritten.
        $this->assertSame(2, $item->stepInstances()->where('step_number', 1)->count());
    }

    public function test_return_to_previous_step_falls_back_to_the_requester_at_step_one(): void
    {
        $approver = $this->approver();
        $project = $this->project();
        $version = $this->defaultChainVersion($project, 'return_to_previous_step');
        $this->stepFor($version, 1, [$approver], ['quorum_mode' => 'any']);

        $item = $this->submitItem($project);
        ApprovalWorkflowEngine::advance($item, 'rejected', $approver);

        $this->assertSame('changes_requested', $item->fresh()->status);
    }

    public function test_a_step_override_beats_the_chains_reject_behaviour(): void
    {
        $approver = $this->approver();
        $project = $this->project();
        $version = $this->defaultChainVersion($project, 'reject_item');
        $this->stepFor($version, 1, [$approver], [
            'quorum_mode' => 'any',
            'on_reject_override' => 'return_to_requester',
        ]);

        $item = $this->submitItem($project);
        ApprovalWorkflowEngine::advance($item, 'rejected', $approver);

        $this->assertSame('changes_requested', $item->fresh()->status);
    }

    // ------------------------------------------------------- guards on advance

    public function test_someone_who_is_not_an_eligible_approver_cannot_decide(): void
    {
        $approver = $this->approver();
        $bystander = $this->approver();
        $project = $this->project();
        $version = $this->defaultChainVersion($project);
        $this->stepFor($version, 1, [$approver]);

        $item = $this->submitItem($project);

        $this->assertAborts(403, fn () => ApprovalWorkflowEngine::advance($item, 'approved', $bystander));
        $this->assertSame('pending', $item->fresh()->status);
    }

    public function test_an_approver_cannot_record_a_second_decision_on_the_same_step(): void
    {
        // Quorum of two, so the step is still open after the first decision —
        // without the guard, one approver could meet the quorum single-handed.
        [$first, $second] = [$this->approver(), $this->approver()];
        $project = $this->project();
        $version = $this->defaultChainVersion($project);
        $this->stepFor($version, 1, [$first, $second], ['quorum_mode' => 'all']);

        $item = $this->submitItem($project);
        ApprovalWorkflowEngine::advance($item, 'approved', $first);

        $this->assertAborts(409, fn () => ApprovalWorkflowEngine::advance($item, 'approved', $first));

        $this->assertSame('pending', $item->fresh()->status);
        $this->assertSame(1, $this->activeInstance($item)->decisions()->count());
    }

    public function test_deciding_on_a_settled_request_is_refused(): void
    {
        $approver = $this->approver();
        $project = $this->project();
        $version = $this->defaultChainVersion($project);
        $this->stepFor($version, 1, [$approver]);

        $item = $this->submitItem($project);
        ApprovalWorkflowEngine::advance($item, 'approved', $approver);

        $this->assertAborts(409, fn () => ApprovalWorkflowEngine::advance($item, 'approved', $approver));
    }

    public function test_each_decision_is_recorded_against_the_person_who_made_it(): void
    {
        $approver = $this->approver();
        $project = $this->project();
        $version = $this->defaultChainVersion($project);
        $this->stepFor($version, 1, [$approver], ['quorum_mode' => 'any']);

        $item = $this->submitItem($project);
        $decision = ApprovalWorkflowEngine::advance($item, 'rejected', $approver, 'Missing receipts.');

        $this->assertSame($approver->id, $decision->decided_by);
        $this->assertSame('rejected', $decision->decision);
        $this->assertSame('Missing receipts.', $decision->comment);
        $this->assertNotNull($decision->decided_at);
    }

    // ---------------------------------------------------------------- resubmit

    public function test_resubmit_reopens_step_one_as_a_new_attempt(): void
    {
        $approver = $this->approver();
        $requester = $this->approver();
        $project = $this->project();
        $version = $this->defaultChainVersion($project, 'return_to_requester');
        $this->stepFor($version, 1, [$approver], ['quorum_mode' => 'any']);

        $item = $this->submitItem($project, $requester);
        ApprovalWorkflowEngine::advance($item, 'rejected', $approver);
        $this->assertSame('changes_requested', $item->fresh()->status);

        ApprovalWorkflowEngine::resubmit($item, $requester);
        $item->refresh();

        $this->assertSame('pending', $item->status);
        $this->assertSame(1, $item->current_step_number);
        $this->assertNull($item->decided_at);

        $reopened = $this->activeInstance($item);
        $this->assertSame(1, $reopened->step_number);
        $this->assertSame(2, $reopened->attempt_number);
    }

    public function test_a_rejected_request_can_be_resubmitted(): void
    {
        $approver = $this->approver();
        $requester = $this->approver();
        $project = $this->project();
        $version = $this->defaultChainVersion($project, 'reject_item');
        $this->stepFor($version, 1, [$approver], ['quorum_mode' => 'any']);

        $item = $this->submitItem($project, $requester);
        ApprovalWorkflowEngine::advance($item, 'rejected', $approver);

        ApprovalWorkflowEngine::resubmit($item, $requester);
        $item->refresh();

        $this->assertSame('pending', $item->status);
        $this->assertNull($item->decided_at, 'Reviving a rejected request clears its decision stamp.');
    }

    public function test_a_request_still_in_flight_cannot_be_resubmitted(): void
    {
        $approver = $this->approver();
        $requester = $this->approver();
        $project = $this->project();
        $version = $this->defaultChainVersion($project);
        $this->stepFor($version, 1, [$approver]);

        $item = $this->submitItem($project, $requester);

        $this->assertAborts(409, fn () => ApprovalWorkflowEngine::resubmit($item, $requester));
    }

    // ------------------------------------------------------------------ cancel

    public function test_cancelling_closes_the_active_step(): void
    {
        $approver = $this->approver();
        $requester = $this->approver();
        $project = $this->project();
        $version = $this->defaultChainVersion($project);
        $this->stepFor($version, 1, [$approver]);

        $item = $this->submitItem($project, $requester);
        ApprovalWorkflowEngine::cancel($item, $requester);
        $item->refresh();

        $this->assertSame('cancelled', $item->status);
        $this->assertNotNull($item->decided_at);
        $this->assertNull($this->activeInstance($item));
        $this->assertSame('cancelled', $item->stepInstances()->first()->status);
    }

    public function test_a_cancelled_request_can_no_longer_be_decided(): void
    {
        $approver = $this->approver();
        $project = $this->project();
        $version = $this->defaultChainVersion($project);
        $this->stepFor($version, 1, [$approver]);

        $item = $this->submitItem($project);
        ApprovalWorkflowEngine::cancel($item, $approver);

        $this->assertAborts(409, fn () => ApprovalWorkflowEngine::advance($item, 'approved', $approver));
    }

    // ----------------------------------------------------------- notifications

    /**
     * Also covers the deferral itself: these notifications are raised inside the
     * engine's transaction via DB::afterCommit, so a passing assertion means they
     * survive the commit rather than being dropped or sent early.
     */
    public function test_approvers_are_told_when_a_step_opens(): void
    {
        [$first, $second] = [$this->approver(), $this->approver()];
        $later = $this->approver();

        $project = $this->project();
        $version = $this->defaultChainVersion($project);
        $this->stepFor($version, 1, [$first, $second], ['quorum_mode' => 'any']);
        $this->stepFor($version, 2, [$later]);

        $item = $this->submitItem($project);

        Notification::assertSentTo($first, ApprovalRequestedNotification::class);
        Notification::assertSentTo($second, ApprovalRequestedNotification::class);
        Notification::assertNotSentTo($later, ApprovalRequestedNotification::class);

        // Progressing the chain brings in the next step's approver, not before.
        ApprovalWorkflowEngine::advance($item, 'approved', $first);

        Notification::assertSentTo($later, ApprovalRequestedNotification::class);
    }
}
