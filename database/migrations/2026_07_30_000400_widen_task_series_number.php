<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            // A restored task keeps its old number with a marker appended, and
            // a 20-char prefix plus 10 digits plus " (restored)" overflows the
            // original 40. Widened rather than truncating the marker, which
            // would leave the number looking like a different one.
            $table->string('series_number', 60)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->string('series_number', 40)->nullable()->change();
        });
    }
};
