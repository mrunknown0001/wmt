<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A single task can now be covered on its own, not just a person's whole
     * workload. task_id null keeps the original meaning — cover everything the
     * person holds; task_id set narrows the same machinery to one task, so the
     * ledger, the hand-back rules and the overnight return all apply unchanged.
     */
    public function up(): void
    {
        Schema::table('task_delegations', function (Blueprint $table) {
            $table->foreignId('task_id')
                ->nullable()
                ->after('user_id')
                ->constrained()
                ->cascadeOnDelete();

            // Looking up whether one task is already under its own cover.
            $table->index(['task_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('task_delegations', function (Blueprint $table) {
            $table->dropIndex(['task_id', 'status']);
            $table->dropConstrainedForeignId('task_id');
        });
    }
};
