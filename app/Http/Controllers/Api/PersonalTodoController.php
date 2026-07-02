<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PersonalTodo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PersonalTodoController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $todos = $request->user()
            ->personalTodos()
            ->ordered()
            ->get(['id', 'title', 'is_completed', 'position']);

        return response()->json(['todos' => $todos]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
        ]);

        $maxPosition = $request->user()
            ->personalTodos()
            ->incomplete()
            ->max('position') ?? -1;

        $todo = $request->user()->personalTodos()->create([
            'title' => $validated['title'],
            'position' => $maxPosition + 1,
        ]);

        return response()->json([
            'todo' => $todo->only('id', 'title', 'is_completed', 'position'),
        ], 201);
    }

    public function update(Request $request, PersonalTodo $personalTodo): JsonResponse
    {
        if ($personalTodo->user_id !== $request->user()->id) {
            abort(403);
        }

        $validated = $request->validate([
            'title' => ['sometimes', 'string', 'max:255'],
            'is_completed' => ['sometimes', 'boolean'],
        ]);

        $personalTodo->update($validated);

        return response()->json([
            'todo' => $personalTodo->only('id', 'title', 'is_completed', 'position'),
        ]);
    }

    public function destroy(Request $request, PersonalTodo $personalTodo): JsonResponse
    {
        if ($personalTodo->user_id !== $request->user()->id) {
            abort(403);
        }

        $personalTodo->delete();

        return response()->json(['success' => true]);
    }

    public function reorder(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ids' => ['required', 'array'],
            'ids.*' => ['integer'],
        ]);

        $userId = $request->user()->id;

        foreach ($validated['ids'] as $position => $id) {
            PersonalTodo::where('id', $id)
                ->where('user_id', $userId)
                ->update(['position' => $position]);
        }

        return response()->json(['success' => true]);
    }
}
