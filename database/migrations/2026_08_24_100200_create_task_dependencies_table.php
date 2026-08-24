<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_dependencies', function (Blueprint $table) {
            $table->id();

            // "task_id depends on depends_on_task_id" — the dependent task
            // cannot be closed until the one it depends on is done.
            $table->foreignId('task_id')->constrained('tasks')->cascadeOnDelete();
            $table->foreignId('depends_on_task_id')->constrained('tasks')->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            // The same edge twice is meaningless, and a duplicate would make the
            // blocked-by list repeat itself. Enforced in the database as well as
            // in validation, so a concurrent double submit cannot slip through.
            $table->unique(['task_id', 'depends_on_task_id']);

            // Both directions are queried: "what blocks me" when closing, and
            // "what am I blocking" when drawing arrows and warning on delete.
            $table->index('depends_on_task_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('task_dependencies');
    }
};
