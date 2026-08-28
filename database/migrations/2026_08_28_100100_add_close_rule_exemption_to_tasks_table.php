<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A per-task exception to the project's close rules.
 *
 * The rule itself lives on the project and applies to every task in it, which
 * is right until the one case it cannot fit: work that genuinely produced no
 * file. Without a way out the task stays open forever or the rule gets turned
 * off for everyone, and a rule people switch off is not a rule.
 *
 * The reason and the grantor are stored alongside the flag rather than left to
 * an activity entry, because an exemption is the record of a decision — asking
 * "who waived this and why" should not require reading a timeline.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->boolean('close_rule_exempt')->default(false)->after('is_milestone');
            $table->string('close_rule_exempt_reason', 500)->nullable()->after('close_rule_exempt');
            $table->foreignId('close_rule_exempt_by')->nullable()->after('close_rule_exempt_reason')
                ->constrained('users')->nullOnDelete();
            $table->timestamp('close_rule_exempt_at')->nullable()->after('close_rule_exempt_by');
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropConstrainedForeignId('close_rule_exempt_by');
            $table->dropColumn(['close_rule_exempt', 'close_rule_exempt_reason', 'close_rule_exempt_at']);
        });
    }
};
