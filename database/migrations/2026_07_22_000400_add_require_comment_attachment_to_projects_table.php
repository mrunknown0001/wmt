<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            // Project rule: a task may only be closed (Done / Cancelled) once one of
            // its comments carries at least one attachment. Opt-in so existing
            // projects keep their current behaviour.
            $table->boolean('require_comment_attachment_on_close')->default(false)->after('is_pinned');
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn('require_comment_attachment_on_close');
        });
    }
};
