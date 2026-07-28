<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('approval_projects', function (Blueprint $table) {
            // Set once when the project is created and never changed afterwards —
            // editing it would leave already-issued numbers referring to a prefix
            // that no longer exists.
            $table->string('series_prefix', 20)->nullable();

            // Digits the sequence is padded to: 5 gives SP-XXX-00001.
            $table->unsignedTinyInteger('series_padding')->default(5);

            // Next sequence to hand out. Held on the project rather than derived
            // from max(series_number) so a deleted item can't cause a reissue.
            $table->unsignedInteger('series_next')->default(1);
        });

        Schema::table('approval_items', function (Blueprint $table) {
            $table->string('series_number', 40)->nullable();
            $table->unsignedInteger('series_sequence')->nullable();

            // Numbers are quoted in conversation and searched for, so index them.
            $table->index('series_number');
            $table->unique(['approval_project_id', 'series_sequence'], 'ai_project_series_unique');
        });
    }

    public function down(): void
    {
        Schema::table('approval_items', function (Blueprint $table) {
            $table->dropUnique('ai_project_series_unique');
            $table->dropIndex(['series_number']);
            $table->dropColumn(['series_number', 'series_sequence']);
        });

        Schema::table('approval_projects', function (Blueprint $table) {
            $table->dropColumn(['series_prefix', 'series_padding', 'series_next']);
        });
    }
};
