<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

/**
 * The Users admin area is for admins and executives.
 *
 * division_head and supervisor were granted view-users by the seeder, which let
 * them open the Users list and the nav link to it — but every operation there
 * needs manage-users, so the page was visible and inert.
 *
 * This is a data migration rather than a seeder change alone: the seeder only
 * runs on a fresh install, and re-running it on a live database would resync
 * every role. Deploying with `php artisan migrate` has to be enough.
 *
 * Heads and leaders keep the access they actually use — their own people
 * through the org pages, and a team member's overview via the hierarchy checks
 * in UserController::canViewOverview, which do not consult this permission.
 */
return new class extends Migration
{
    private const REVOKE_FROM = ['division_head', 'supervisor'];
    private const PERMISSION = 'view-users';

    public function up(): void
    {
        app(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();

        $permission = Permission::where('name', self::PERMISSION)->first();

        if (!$permission) {
            return; // nothing to revoke
        }

        foreach (self::REVOKE_FROM as $roleName) {
            $role = Role::where('name', $roleName)->first();

            $role?->revokePermissionTo($permission);
        }

        // Granted directly to a person rather than through their role — the
        // same door, and it would stay open after the role change.
        DB::table('model_has_permissions')
            ->where('permission_id', $permission->id)
            ->whereIn('model_id', function ($q) {
                $q->select('model_id')
                    ->from('model_has_roles')
                    ->whereIn('role_id', function ($r) {
                        $r->select('id')->from('roles')->whereIn('name', self::REVOKE_FROM);
                    });
            })
            ->delete();

        app(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        app(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();

        $permission = Permission::where('name', self::PERMISSION)->first();

        if (!$permission) {
            return;
        }

        foreach (self::REVOKE_FROM as $roleName) {
            Role::where('name', $roleName)->first()?->givePermissionTo($permission);
        }

        app(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
