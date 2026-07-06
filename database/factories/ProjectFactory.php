<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class ProjectFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => fake()->sentence(3),
            'description' => fake()->paragraph(),
            'status' => 'active',
            'owner_id' => User::factory(),
            'due_date' => fake()->dateTimeBetween('+1 week', '+3 months'),
        ];
    }
}
