<?php

namespace App\Http\Controllers;

use App\Models\LinkGroup;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Custom groups of users that links can be assigned to. Managed by the same
 * permission that governs links.
 */
class LinkGroupController extends Controller
{
    private function authorizeManage(): void
    {
        abort_unless(auth()->user()->can('manage-links'), 403);
    }

    public function index(): Response
    {
        $this->authorizeManage();

        return Inertia::render('LinkGroups/Index', [
            'groups' => LinkGroup::with('members:id,name')
                ->withCount('members')
                ->orderBy('name')
                ->paginate(20),
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->authorizeManage();

        $data = $this->validated($request);

        $group = LinkGroup::create([
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'created_by' => $request->user()->id,
        ]);
        $group->members()->sync($data['member_ids'] ?? []);

        return back()->with('success', 'Group created successfully.');
    }

    public function update(Request $request, LinkGroup $linkGroup): RedirectResponse
    {
        $this->authorizeManage();

        $data = $this->validated($request);

        $linkGroup->update([
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
        ]);
        $linkGroup->members()->sync($data['member_ids'] ?? []);

        return back()->with('success', 'Group updated successfully.');
    }

    public function destroy(LinkGroup $linkGroup): RedirectResponse
    {
        $this->authorizeManage();

        // Assignments pointing at this group are removed so links don't keep a
        // dangling audience.
        \App\Models\LinkAssignment::where('assignable_type', LinkGroup::class)
            ->where('assignable_id', $linkGroup->id)
            ->delete();

        $linkGroup->members()->detach();
        $linkGroup->delete();

        return back()->with('success', 'Group deleted successfully.');
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:500'],
            'member_ids' => ['nullable', 'array'],
            'member_ids.*' => ['integer', 'exists:users,id'],
        ]);
    }
}
