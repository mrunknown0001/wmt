<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreLinkRequest;
use App\Http\Requests\UpdateLinkRequest;
use App\Models\Link;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class LinkController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();
        $canManage = $user->hasPermissionTo('manage-links');

        $query = Link::with('user', 'creator');

        if (!$canManage) {
            $query->where('user_id', $user->id);
        } else {
            if ($userId = $request->input('user_id')) {
                $query->where('user_id', $userId);
            }
        }

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', '%' . $search . '%')
                    ->orWhere('url', 'like', '%' . $search . '%')
                    ->orWhere('description', 'like', '%' . $search . '%');
            });
        }

        $links = $query->orderByDesc('created_at')
            ->paginate(20)
            ->withQueryString();

        $users = $canManage
            ? User::where('is_active', true)->orderBy('name')->get(['id', 'name'])
            : [];

        return Inertia::render('Links/Index', [
            'links' => $links,
            'users' => $users,
            'filters' => [
                'search' => $request->input('search', ''),
                'user_id' => $request->input('user_id', ''),
            ],
        ]);
    }

    public function create(): Response
    {
        $this->authorize('create', Link::class);

        return Inertia::render('Links/Create', [
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function store(StoreLinkRequest $request): RedirectResponse
    {
        $link = Link::create([
            ...$request->validated(),
            'created_by' => $request->user()->id,
        ]);

        ActivityLogger::logCreated($link, $request->user());

        return redirect()->route('links.index')
            ->with('success', 'Link created successfully.');
    }

    public function edit(Link $link): Response
    {
        $this->authorize('update', $link);

        $link->load('user', 'creator');

        return Inertia::render('Links/Edit', [
            'link' => $link,
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function update(UpdateLinkRequest $request, Link $link): RedirectResponse
    {
        $oldValues = $link->only(['title', 'description', 'url', 'user_id']);

        $link->update($request->validated());

        ActivityLogger::logChanges($link, $oldValues, $request->user());

        return redirect()->route('links.index')
            ->with('success', 'Link updated successfully.');
    }

    public function destroy(Link $link): RedirectResponse
    {
        $this->authorize('delete', $link);

        ActivityLogger::logDeleted($link, auth()->user());

        $link->delete();

        return redirect()->route('links.index')
            ->with('success', 'Link deleted successfully.');
    }
}
