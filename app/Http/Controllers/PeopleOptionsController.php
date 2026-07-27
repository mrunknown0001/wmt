<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\Division;
use App\Models\Team;
use App\Models\User;
use Illuminate\Http\JsonResponse;

/**
 * Options for the People custom-field picker: every active user plus the org
 * units used to filter them. Available to any authenticated user, since anyone
 * filling in a People field needs to choose from the directory.
 */
class PeopleOptionsController extends Controller
{
    public function __invoke(): JsonResponse
    {
        // division_id is resolved through the user's department so the picker can
        // filter by division without another lookup per row.
        $departmentDivisions = Department::pluck('division_id', 'id');

        $users = User::where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'position', 'department_id', 'team_id'])
            ->map(fn ($u) => [
                'id' => $u->id,
                'name' => $u->name,
                'position' => $u->position,
                'department_id' => $u->department_id,
                'team_id' => $u->team_id,
                'division_id' => $u->department_id ? ($departmentDivisions[$u->department_id] ?? null) : null,
            ]);

        return response()->json([
            'users' => $users,
            'divisions' => Division::orderBy('name')->get(['id', 'name']),
            'departments' => Department::orderBy('name')->get(['id', 'name', 'division_id']),
            'teams' => Team::orderBy('name')->get(['id', 'name', 'department_id']),
        ]);
    }
}
