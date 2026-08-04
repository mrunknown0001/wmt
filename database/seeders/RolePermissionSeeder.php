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
            // Opens the Users admin area. Admins and executives only:
            // heads and leaders reach their own people through the org
            // pages and a user's overview, not the staff table.
            'view-users',
            'manage-roles',
            'manage-divisions',
            'view-divisions',
            'manage-departments',
            'view-departments',
            'manage-teams',
            'view-teams',
            'manage-projects',
            'view-projects',
            'manage-tasks',
            'view-tasks',
            'manage-links',
            'view-links',
            'manage-approval-projects',
            'view-approval-projects',
            // Admin-only. Both show every person's numbers across the whole
            // organisation, which is a different thing from a head seeing the
            // unit they run.
            'view-workload',
            'view-reports',
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
            'view-projects',
            'view-tasks',
            'view-links',
            'view-approval-projects',
        ]);

        $divisionHead = Role::firstOrCreate(['name' => 'division_head']);
        $divisionHead->syncPermissions([
            'view-divisions',
            'view-departments',
            'view-teams',
            'view-projects',
            'view-tasks',
            'view-approval-projects',
        ]);

        $supervisor = Role::firstOrCreate(['name' => 'supervisor']);
        $supervisor->syncPermissions([
            'view-departments',
            'view-teams',
            'view-projects',
            'view-tasks',
            'manage-tasks',
            'view-approval-projects',
        ]);

        $user = Role::firstOrCreate(['name' => 'user']);
        $user->syncPermissions([
            'view-projects',
            'view-tasks',
            'view-approval-projects',
        ]);
    }
}
