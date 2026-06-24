<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class RolePermissionSeeder extends Seeder
{
    public function run(): void
    {
        // Reset cached roles and permissions
        app()[\Spatie\Permission\PermissionRegistrar::class]->forgetCachedPermissions();

        // Create permissions
        $permissions = [
            'manage-users',
            'view-users',
            'manage-roles',
        ];

        foreach ($permissions as $permission) {
            Permission::firstOrCreate(['name' => $permission]);
        }

        // Create roles and assign permissions
        $admin = Role::firstOrCreate(['name' => 'admin']);
        $admin->syncPermissions($permissions);

        $executive = Role::firstOrCreate(['name' => 'executive']);
        $executive->syncPermissions(['view-users']);

        $divisionHead = Role::firstOrCreate(['name' => 'division_head']);
        $divisionHead->syncPermissions(['view-users']);

        $supervisor = Role::firstOrCreate(['name' => 'supervisor']);
        $supervisor->syncPermissions(['view-users']);

        $user = Role::firstOrCreate(['name' => 'user']);
        // user role has no special permissions in Phase 1
    }
}
