<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_delegations', function (Blueprint $table) {
            $table->id();

            // Whose work is being covered. They stay the owner of record — the
            // stand-in holds the tasks, and hands them straight back.
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            $table->date('starts_on');

            // Required, unlike approval delegation: the whole point is that the
            // tasks come back on their own, and open-ended cover never would.
            $table->date('ends_on');

            $table->string('reason', 255)->nullable();

            // scheduled -> active -> ended. Held explicitly rather than derived
            // from the dates because activating and ending both move real task
            // rows, and those must happen exactly once.
            $table->string('status', 20)->default('scheduled');

            $table->timestamp('activated_at')->nullable();
            $table->timestamp('ended_at')->nullable();

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['status', 'starts_on', 'ends_on']);
            $table->index(['user_id', 'status']);
        });

        Schema::create('task_delegation_delegates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_delegation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // Deal order for the round-robin split, so the same task lands with
            // the same person whether it is dealt at activation or later.
            $table->unsignedTinyInteger('position')->default(0);

            $table->unique(['task_delegation_id', 'user_id']);
        });

        Schema::create('task_delegation_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_delegation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();

            // Who held it before, and who is holding it now. Recording the
            // original here rather than inferring it from the delegation is
            // what makes the hand-back exact even if the task moved twice.
            $table->foreignId('original_assignee_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('delegate_id')->constrained('users')->cascadeOnDelete();

            $table->timestamp('assigned_at');

            // Null while the stand-in still holds it. Set when handed back, or
            // when the hand-back was skipped because someone moved it on.
            $table->timestamp('restored_at')->nullable();

            $table->unique(['task_delegation_id', 'task_id']);
            $table->index(['task_delegation_id', 'restored_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('task_delegation_items');
        Schema::dropIfExists('task_delegation_delegates');
        Schema::dropIfExists('task_delegations');
    }
};
