<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreTeamRequest;
use App\Http\Requests\UpdateTeamRequest;
use App\Models\Department;
use App\Models\Team;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class TeamController extends Controller
{
    public function index(): Response
    {
        $this->authorize('viewAny', Team::class);

        $teams = Team::with('department.division', 'leader')
            ->withCount('members')
            ->orderBy('name')
            ->paginate(20);

        return Inertia::render('Teams/Index', [
            'teams' => $teams,
        ]);
    }

    public function create(): Response
    {
        $this->authorize('create', Team::class);

        return Inertia::render('Teams/Create', [
            'departments' => Department::with('division')->orderBy('name')->get(['id', 'name', 'division_id']),
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function store(StoreTeamRequest $request): RedirectResponse
    {
        $team = Team::create($request->validated());

        ActivityLogger::logCreated($team, $request->user());

        return redirect()->route('teams.index')
            ->with('success', 'Team created successfully.');
    }

    public function edit(Team $team): Response
    {
        $this->authorize('update', $team);

        $team->load('department.division', 'leader');

        return Inertia::render('Teams/Edit', [
            'team' => $team,
            'departments' => Department::with('division')->orderBy('name')->get(['id', 'name', 'division_id']),
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function update(UpdateTeamRequest $request, Team $team): RedirectResponse
    {
        $oldValues = $team->only(['name', 'description', 'department_id', 'leader_id']);

        $team->update($request->validated());

        ActivityLogger::logChanges($team, $oldValues, $request->user());

        return redirect()->route('teams.index')
            ->with('success', 'Team updated successfully.');
    }

    public function destroy(Team $team): RedirectResponse
    {
        $this->authorize('delete', $team);

        ActivityLogger::logDeleted($team, auth()->user());

        $team->delete();

        return redirect()->route('teams.index')
            ->with('success', 'Team deleted successfully.');
    }
}
