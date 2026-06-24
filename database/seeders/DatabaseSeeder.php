<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(RolePermissionSeeder::class);
        $this->call(OrganizationSeeder::class);

        // Create default admin
        $admin = User::firstOrCreate(
            ['email' => 'admin@wmt.com'],
            [
                'name' => 'Admin',
                'password' => bcrypt('password'),
                'position' => 'System Administrator',
                'is_active' => true,
                'email_verified_at' => now(),
            ]
        );
        $admin->assignRole('admin');
    }
}
