<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Minutes for a meeting task — one record per task, filled in by the people who
 * were there.
 *
 * The repeating sections (attendees, agenda, discussion, action items,
 * decisions, issues) are JSON rather than six child tables. They are read and
 * written whole, as one document, and never queried across meetings; separate
 * tables would buy joins nobody performs at the cost of six models to keep in
 * step. Rows that name a person carry the user id so the reference survives a
 * rename, alongside a name snapshot so a departed colleague still reads as
 * themselves in an old minute rather than vanishing.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_minutes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->unique()->constrained()->cascadeOnDelete();

            // 1. Meeting information
            $table->string('meeting_title')->nullable();
            $table->date('meeting_date')->nullable();
            $table->string('start_time', 40)->nullable();
            $table->string('end_time', 40)->nullable();
            $table->string('venue')->nullable();
            $table->foreignId('facilitator_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('prepared_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('meeting_type', 40)->nullable();

            // 2. Attendees
            $table->json('attendees')->nullable();
            $table->text('absent_notes')->nullable();

            // 3. Objectives / agenda
            $table->json('agenda')->nullable();

            // 4. Discussion and deliberations
            $table->json('discussions')->nullable();

            // 5. Action items
            $table->json('action_items')->nullable();

            // 6. Key decisions / resolutions
            $table->json('decisions')->nullable();

            // 7. Issues / concerns / risks
            $table->json('issues')->nullable();

            // 8. Other matters
            $table->text('other_matters')->nullable();

            // 9. Next meeting
            $table->date('next_meeting_date')->nullable();
            $table->string('next_meeting_time', 40)->nullable();
            $table->string('next_meeting_venue')->nullable();
            $table->text('next_meeting_agenda')->nullable();

            // 10. Adjournment
            $table->string('adjourned_at', 40)->nullable();

            // 11. Confirmation / acknowledgment
            $table->string('prepared_by_position')->nullable();
            $table->date('prepared_by_date')->nullable();
            $table->foreignId('reviewed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('reviewed_by_position')->nullable();
            $table->date('reviewed_by_date')->nullable();

            // Who last touched the record, so a minute has an author.
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('task_minutes');
    }
};
