<?php

use App\Models\NoteFolder;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('note_folders', function (Blueprint $table) {
            // Ancestor trail including this folder, e.g. "/3/7/". Sharing a
            // folder reaches everything beneath it, and walking parent links
            // per note would be a query per level; a LIKE on the path answers
            // "every folder under this one" in one go.
            $table->string('path', 255)->nullable()->after('parent_id');
            $table->index('path');
        });

        // Backfill for folders created before the column existed.
        NoteFolder::withTrashed()->orderBy('id')->get()->each(fn (NoteFolder $f) => $f->syncPath());

        Schema::create('note_folder_shares', function (Blueprint $table) {
            $table->id();
            $table->foreignId('note_folder_id')->constrained()->cascadeOnDelete();

            // Same audience shape as note_shares: a User, Team, Department or
            // Division.
            $table->morphs('shareable');

            $table->string('role', 20)->default('viewer'); // viewer | editor | admin
            $table->timestamps();

            $table->unique(['note_folder_id', 'shareable_type', 'shareable_id'], 'note_folder_shares_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('note_folder_shares');

        Schema::table('note_folders', function (Blueprint $table) {
            $table->dropIndex(['path']);
            $table->dropColumn('path');
        });
    }
};
