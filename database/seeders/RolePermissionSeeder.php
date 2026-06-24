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
            'manage-divisions',
            'view-divisions',
            'manage-departments',
            'view-departments',
            'manage-teams',
            'view-teams',
        ];

        foreach ($permissions as $permission) {
            Permission::firstOrCreate(['name' => $permission]);
        }

        // Create roles and assign permissions
        $admin = Role::firstOrCreate(['name' => 'admin']);
        $admin->syncPermissions($permissions);

        $executive = Role::firstOrCreate(['name' => 'executive']);
        $executive->syncPermissions([
            'view-users',
            'view-divisions',
            'view-departments',
            'view-teams',
        ]);

        $divisionHead = Role::firstOrCreate(['name' => 'division_head']);
        $divisionHead->syncPermissions([
            'view-users',
            'view-divisions',
            'view-departments',
            'view-teams',
        ]);

        $supervisor = Role::firstOrCreate(['name' => 'supervisor']);
        $supervisor->syncPermissions([
            'view-users',
            'view-departments',
            'view-teams',
        ]);

        $user = Role::firstOrCreate(['name' => 'user']);
        // user role has no special permissions
    }
}
