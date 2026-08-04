<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

/**
 * Workload and Reports become admin-only.
 *
 * Both pages were reachable by anyone signed in — no permission was ever
 * checked on either route, so the nav simply showed them to everybody. Naming
 * the permissions rather than hard-coding `hasRole('admin')` in the controllers
 * means the door can be opened to somebody else later from the roles table
 * instead of from a deploy.
 *
 * A data migration rather than a seeder edit: the seeder only runs on a fresh
 * install, and re-running it against a live database would resync every role.
 */
return new class extends Migration
{
    private const PERMISSIONS = ['view-workload', 'view-reports'];

    public function up(): void
    {
        app(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();

        $admin = Role::where('name', 'admin')->first();

        foreach (self::PERMISSIONS as $name) {
            $permission = Permission::firstOrCreate(['name' => $name]);

            $admin?->givePermissionTo($permission);
        }

        app(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        app(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();

        Permission::whereIn('name', self::PERMISSIONS)->delete();

        app(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
