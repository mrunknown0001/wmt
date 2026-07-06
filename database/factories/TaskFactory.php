<?php

namespace Database\Factories;

use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class TaskFactory extends Factory
{
    public function definition(): array
    {
        return [
            'project_id' => Project::factory(),
            'title' => fake()->sentence(4),
            'description' => fake()->paragraph(),
            'status' => fake()->randomElement(['backlog', 'to_do', 'in_progress', 'in_review', 'done']),
            'priority' => fake()->randomElement(['low', 'medium', 'high', 'urgent']),
            'assigned_to' => User::factory(),
            'created_by' => User::factory(),
            'position' => 0,
        ];
    }
}
