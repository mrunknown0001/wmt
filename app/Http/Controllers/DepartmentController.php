<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreDepartmentRequest;
use App\Http\Requests\UpdateDepartmentRequest;
use App\Models\Department;
use App\Models\Division;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DepartmentController extends Controller
{
    public function index(Request $request): Response
    {
        $this->authorize('viewAny', Department::class);

        $query = Department::with('division', 'head')
            ->withCount('teams', 'users');

        if ($search = $request->input('search')) {
            $query->where('name', 'like', '%' . $search . '%');
        }

        if ($divisionId = $request->input('division_id')) {
            $query->where('division_id', $divisionId);
        }

        $departments = $query->orderBy('name')
            ->paginate(20)
            ->withQueryString();

        return Inertia::render('Departments/Index', [
            'departments' => $departments,
            'divisions' => Division::orderBy('name')->get(['id', 'name']),
            'filters' => [
                'search' => $request->input('search', ''),
                'division_id' => $request->input('division_id', ''),
            ],
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
