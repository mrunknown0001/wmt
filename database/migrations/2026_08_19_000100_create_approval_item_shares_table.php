<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * People a decided request has been shared with.
     *
     * Users only, unlike note_shares which is polymorphic over the org chart. An
     * approval carries the decision trail and whatever was attached to it, so it
     * is handed to named people rather than broadcast to a division.
     */
    public function up(): void
    {
        Schema::create('approval_item_shares', function (Blueprint $table) {
            $table->id();
            $table->foreignId('approval_item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // Kept for the audit trail: who granted this sight of the request.
            // nullOnDelete so a departing sharer does not revoke the access.
            $table->foreignId('shared_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['approval_item_id', 'user_id'], 'approval_item_shares_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_item_shares');
    }
};
