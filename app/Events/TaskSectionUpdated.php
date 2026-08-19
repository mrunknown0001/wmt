<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * A section was added, renamed, recoloured, moved, removed or reordered.
 *
 * Shares the project channel with TaskUpdated rather than opening a second one:
 * anyone who can see the board already listens there, and sections and tasks are
 * two halves of the same view.
 */
class TaskSectionUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param array $section  the affected section; ['id' => n] is enough for a delete
     * @param array $sections the whole ordered list, carried only by 'reordered' —
     *                        a reorder has no single subject, and sending the
     *                        result avoids the client trying to replay the moves
     */
    public function __construct(
        public ?int $projectId,
        public array $section,
        public string $changeType,
        public int $changedBy,
        public array $sections = [],
    ) {}

    public function broadcastOn(): array
    {
        if (! $this->projectId) {
            return [];
        }

        return [new PrivateChannel("project.{$this->projectId}")];
    }

    public function broadcastAs(): string
    {
        return 'section.updated';
    }

    public function broadcastWith(): array
    {
        return [
            'section' => $this->section,
            'sections' => $this->sections,
            'change_type' => $this->changeType,
            'changed_by' => $this->changedBy,
        ];
    }
}
