<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $table->boolean('escalation_enabled')->default(true);
            $table->json('escalation_tiers')->nullable();
        });

        DB::table('settings')->whereNull('escalation_tiers')->update([
            'escalation_tiers' => json_encode([
                ['days' => 1, 'enabled' => true],
                ['days' => 3, 'enabled' => true],
                ['days' => 7, 'enabled' => true],
                ['days' => 14, 'enabled' => true],
            ]),
        ]);
    }

    public function down(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $table->dropColumn(['escalation_enabled', 'escalation_tiers']);
        });
    }
};
