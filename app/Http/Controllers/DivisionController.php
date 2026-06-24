<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreDivisionRequest;
use App\Http\Requests\UpdateDivisionRequest;
use App\Models\Division;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class DivisionController extends Controller
{
    public function index(): Response
    {
        $this->authorize('viewAny', Division::class);

        $divisions = Division::with('head', 'departments')
            ->withCount('departments')
            ->orderBy('name')
            ->paginate(20);

        return Inertia::render('Divisions/Index', [
            'divisions' => $divisions,
        ]);
    }

    public function create(): Response
    {
        $this->authorize('create', Division::class);

        return Inertia::render('Divisions/Create', [
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function store(StoreDivisionRequest $request): RedirectResponse
    {
        Division::create($request->validated());

        return redirect()->route('divisions.index')
            ->with('success', 'Division created successfully.');
    }

    public function edit(Division $division): Response
    {
        $this->authorize('update', $division);

        $division->load('head');

        return Inertia::render('Divisions/Edit', [
            'division' => $division,
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function update(UpdateDivisionRequest $request, Division $division): RedirectResponse
    {
        $division->update($request->validated());

        return redirect()->route('divisions.index')
            ->with('success', 'Division updated successfully.');
    }

    public function destroy(Division $division): RedirectResponse
    {
        $this->authorize('delete', $division);

        $division->delete();

        return redirect()->route('divisions.index')
            ->with('success', 'Division deleted successfully.');
    }
}
