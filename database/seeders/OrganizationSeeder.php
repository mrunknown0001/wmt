<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\Division;
use App\Models\Team;
use Illuminate\Database\Seeder;

class OrganizationSeeder extends Seeder
{
    public function run(): void
    {
        // Operations Division
        $operations = Division::firstOrCreate(
            ['name' => 'Operations'],
            ['description' => 'Handles day-to-day operational activities']
        );

        $logistics = Department::firstOrCreate(
            ['name' => 'Logistics', 'division_id' => $operations->id],
            ['description' => 'Supply chain and logistics management']
        );
        Team::firstOrCreate(
            ['name' => 'Warehouse Team', 'department_id' => $logistics->id],
            ['description' => 'Warehouse operations and inventory']
        );
        Team::firstOrCreate(
            ['name' => 'Transport Team', 'department_id' => $logistics->id],
            ['description' => 'Fleet and delivery management']
        );

        $production = Department::firstOrCreate(
            ['name' => 'Production', 'division_id' => $operations->id],
            ['description' => 'Manufacturing and production processes']
        );
        Team::firstOrCreate(
            ['name' => 'Assembly Team', 'department_id' => $production->id],
            ['description' => 'Product assembly line']
        );

        // Corporate Division
        $corporate = Division::firstOrCreate(
            ['name' => 'Corporate'],
            ['description' => 'Corporate governance and support functions']
        );

        $hr = Department::firstOrCreate(
            ['name' => 'Human Resources', 'division_id' => $corporate->id],
            ['description' => 'People management and recruitment']
        );
        Team::firstOrCreate(
            ['name' => 'Recruitment Team', 'department_id' => $hr->id],
            ['description' => 'Hiring and talent acquisition']
        );

        $finance = Department::firstOrCreate(
            ['name' => 'Finance', 'division_id' => $corporate->id],
            ['description' => 'Financial planning and accounting']
        );

        // Technology Division
        $technology = Division::firstOrCreate(
            ['name' => 'Technology'],
            ['description' => 'IT and software development']
        );

        $engineering = Department::firstOrCreate(
            ['name' => 'Engineering', 'division_id' => $technology->id],
            ['description' => 'Software engineering and development']
        );
        Team::firstOrCreate(
            ['name' => 'Backend Team', 'department_id' => $engineering->id],
            ['description' => 'Server-side development']
        );
        Team::firstOrCreate(
            ['name' => 'Frontend Team', 'department_id' => $engineering->id],
            ['description' => 'Client-side development']
        );

        $it = Department::firstOrCreate(
            ['name' => 'IT Support', 'division_id' => $technology->id],
            ['description' => 'Infrastructure and technical support']
        );
    }
}
