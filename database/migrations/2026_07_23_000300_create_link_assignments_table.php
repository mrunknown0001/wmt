<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A link can be assigned to any mix of targets: individual users, teams,
        // departments, divisions, roles, or custom link groups.
        Schema::create('link_assignments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('link_id');
            $table->string('assignable_type');
            $table->unsignedBigInteger('assignable_id');
            $table->timestamps();

            $table->foreign('link_id')->references('id')->on('links')->cascadeOnDelete();
            $table->unique(['link_id', 'assignable_type', 'assignable_id'], 'link_assignment_unique');
            $table->index(['assignable_type', 'assignable_id']);
        });

        // Carry existing single-user assignments over so nothing loses its audience.
        $existing = DB::table('links')->whereNotNull('user_id')->get(['id', 'user_id']);
        foreach ($existing as $link) {
            DB::table('link_assignments')->insert([
                'link_id' => $link->id,
                'assignable_type' => \App\Models\User::class,
                'assignable_id' => $link->user_id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        // user_id stays for backward compatibility but is no longer required.
        Schema::table('links', function (Blueprint $table) {
            $table->unsignedBigInteger('user_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('link_assignments');
    }
};
