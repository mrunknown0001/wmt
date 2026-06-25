<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->boolean('is_recurring')->default(false)->after('position');
            $table->string('recurrence_frequency')->nullable()->after('is_recurring');
            $table->unsignedSmallInteger('recurrence_interval')->default(1)->after('recurrence_frequency');
            $table->foreignId('recurring_source_id')->nullable()->after('recurrence_interval')
                ->constrained('tasks')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropForeign(['recurring_source_id']);
            $table->dropColumn(['is_recurring', 'recurrence_frequency', 'recurrence_interval', 'recurring_source_id']);
        });
    }
};
