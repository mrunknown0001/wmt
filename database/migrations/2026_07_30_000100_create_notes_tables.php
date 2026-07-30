<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('note_folders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');

            // Folders are personal filing, so they nest under their own owner's
            // folders only. nullOnDelete rather than cascade: deleting a folder
            // should not silently take a subtree of notes with it.
            $table->foreignId('parent_id')->nullable()
                ->constrained('note_folders')->nullOnDelete();

            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['user_id', 'parent_id']);
        });

        Schema::create('notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('note_folder_id')->nullable()
                ->constrained('note_folders')->nullOnDelete();

            $table->string('title')->default('');

            // Rich text from the editor.
            $table->longText('content')->nullable();

            // The same content with the markup stripped, maintained on save.
            // Searching the HTML directly would match tag and attribute names —
            // a search for "strong" or "span" would hit almost everything.
            $table->longText('content_text')->nullable();

            // Archived notes stay readable but drop out of the default list.
            // Distinct from soft-deletion, which is a removal that can be undone.
            $table->timestamp('archived_at')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['user_id', 'archived_at']);
            $table->index('note_folder_id');
        });

        Schema::create('note_shares', function (Blueprint $table) {
            $table->id();
            $table->foreignId('note_id')->constrained()->cascadeOnDelete();

            // Polymorphic audience: a User, Team, Department or Division. One
            // table rather than four columns, so adding an audience type later
            // needs no schema change.
            $table->morphs('shareable');

            $table->string('role', 20)->default('viewer'); // viewer | editor | admin
            $table->timestamps();

            // One rule per audience per note — re-sharing changes the role
            // rather than stacking a second, ambiguous row.
            $table->unique(['note_id', 'shareable_type', 'shareable_id'], 'note_shares_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('note_shares');
        Schema::dropIfExists('notes');
        Schema::dropIfExists('note_folders');
    }
};
