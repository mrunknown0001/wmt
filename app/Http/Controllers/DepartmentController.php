<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreDepartmentRequest;
use App\Http\Requests\UpdateDepartmentRequest;
use App\Models\Department;
use App\Models\Division;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class DepartmentController extends Controller
{
    public function index(): Response
    {
        $this->authorize('viewAny', Department::class);

        $departments = Department::with('division', 'head')
            ->withCount('teams', 'users')
            ->orderBy('name')
            ->paginate(20);

        return Inertia::render('Departments/Index', [
            'departments' => $departments,
        ]);
    }

    public function create(): Response
    {
        $this->authorize('create', Department::class);

        return Inertia::render('Departments/Create', [
            'divisions' => Division::orderBy('name')->get(['id', 'name']),
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function store(StoreDepartmentRequest $request): RedirectResponse
    {
        $department = Department::create($request->validated());

        ActivityLogger::logCreated($department, $request->user());

        return redirect()->route('departments.index')
            ->with('success', 'Department created successfully.');
    }

    public function edit(Department $department): Response
    {
        $this->authorize('update', $department);

        $department->load('division', 'head');

        return Inertia::render('Departments/Edit', [
            'department' => $department,
            'divisions' => Division::orderBy('name')->get(['id', 'name']),
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function update(UpdateDepartmentRequest $request, Department $department): RedirectResponse
    {
        $oldValues = $department->only(['name', 'description', 'division_id', 'head_id']);

        $department->update($request->validated());

        ActivityLogger::logChanges($department, $oldValues, $request->user());

        return redirect()->route('departments.index')
            ->with('success', 'Department updated successfully.');
    }

    public function destroy(Department $department): RedirectResponse
    {
        $this->authorize('delete', $department);

        ActivityLogger::logDeleted($department, auth()->user());

        $department->delete();

        return redirect()->route('departments.index')
            ->with('success', 'Department deleted successfully.');
    }
}
