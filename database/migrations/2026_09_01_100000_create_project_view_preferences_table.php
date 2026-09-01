<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How one person likes to look at one project.
 *
 * Its own table rather than another JSON column on users: these are per project
 * as well as per person, and a row that belongs to a project should go when the
 * project does rather than sit forever inside somebody's preferences blob.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_view_preferences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            // A bag rather than a sort column, so the column widths and the
            // hidden set can move here later without another migration.
            $table->json('preferences')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'project_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_view_preferences');
    }
};
