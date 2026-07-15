<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('folders', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->foreignId('parent_id')->nullable()->constrained('folders')->cascadeOnDelete();
            $table->unsignedTinyInteger('depth')->default(0);
            $table->unsignedTinyInteger('user_depth')->nullable(); // null = system folder; 0-4 = user folder nesting level
            $table->string('path', 512)->default('');
            $table->string('source_type')->nullable(); // Division/Department/Team for system folders
            $table->unsignedBigInteger('source_id')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->integer('position')->default(0);
            $table->timestamps();

            $table->unique(['source_type', 'source_id']);
            $table->index('path');
        });

        Schema::table('projects', function (Blueprint $table) {
            $table->foreignId('folder_id')->nullable()->after('owner_id')->constrained('folders')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropConstrainedForeignId('folder_id');
        });

        Schema::dropIfExists('folders');
    }
};
