<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Labels people can put on their own work, so they can find it again.
 *
 * One vocabulary across the application rather than a set per project: the
 * point of tagging "budget" is that it finds the budget work wherever it lives,
 * and a tag that only means something inside one project is what a custom field
 * is for. The slug carries that promise — "Budget", "budget" and " BUDGET " are
 * one tag, not three, and the name keeps whichever spelling was used first.
 *
 * Polymorphic because the three things worth tagging have nothing else in
 * common: a project, a task, and the minutes of a meeting.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tags', function (Blueprint $table) {
            $table->id();
            $table->string('name', 40);
            $table->string('slug', 40)->unique();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('taggables', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tag_id')->constrained()->cascadeOnDelete();
            $table->morphs('taggable');
            $table->foreignId('tagged_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            // A thing carries a tag once. Without this a double-click on Save
            // is a second copy of the same label.
            $table->unique(['tag_id', 'taggable_id', 'taggable_type'], 'taggables_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('taggables');
        Schema::dropIfExists('tags');
    }
};
