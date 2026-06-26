<?php

namespace App\Http\Controllers;

use App\Models\AiConversation;
use App\Services\AiChatService;
use App\Services\AiContextBuilder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AiChatController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $conversations = $request->user()
            ->aiConversations()
            ->orderByDesc('updated_at')
            ->get(['id', 'title', 'user_message_count', 'created_at', 'updated_at']);

        return response()->json(['conversations' => $conversations]);
    }

    public function store(Request $request): JsonResponse
    {
        $conversation = AiConversation::create([
            'user_id' => $request->user()->id,
            'title' => 'New Chat',
        ]);

        return response()->json(['conversation' => $conversation], 201);
    }

    public function show(Request $request, AiConversation $conversation): JsonResponse
    {
        if ($conversation->user_id !== $request->user()->id) {
            abort(403);
        }

        $conversation->load('messages');

        return response()->json(['conversation' => $conversation]);
    }

    public function destroy(Request $request, AiConversation $conversation): JsonResponse
    {
        if ($conversation->user_id !== $request->user()->id) {
            abort(403);
        }

        $conversation->delete();

        return response()->json(['success' => true]);
    }

    public function sendMessage(Request $request, AiConversation $conversation): StreamedResponse|JsonResponse
    {
        if ($conversation->user_id !== $request->user()->id) {
            abort(403);
        }

        $validated = $request->validate([
            'content' => 'required|string|max:2000',
        ]);

        if ($conversation->hasReachedLimit()) {
            return response()->json([
                'error' => 'Message limit reached. Please start a new conversation.',
            ], 422);
        }

        // Save user message
        $conversation->messages()->create([
            'role' => 'user',
            'content' => $validated['content'],
        ]);
        $conversation->increment('user_message_count');
        $conversation->refresh();

        // Auto-title on first message
        if ($conversation->user_message_count === 1) {
            $conversation->update([
                'title' => Str::limit($validated['content'], 80),
            ]);
        }

        // Build context
        $user = $request->user();
        $systemPrompt = $this->buildSystemPrompt($user);

        // Build message history
        $messageHistory = $conversation->messages()
            ->orderBy('id')
            ->get(['role', 'content'])
            ->map(fn ($m) => ['role' => $m->role, 'content' => $m->content])
            ->toArray();

        return response()->stream(function () use ($systemPrompt, $messageHistory, $conversation) {
            $fullResponse = '';

            foreach (AiChatService::streamChat($systemPrompt, $messageHistory) as $chunk) {
                $fullResponse .= $chunk;
                echo "data: " . json_encode(['chunk' => $chunk]) . "\n\n";

                if (ob_get_level() > 0) {
                    ob_flush();
                }
                flush();
            }

            // Parse follow-up prompts
            $followUpPrompts = $this->parseFollowUpPrompts($fullResponse);
            $cleanContent = $this->stripFollowUpBlock($fullResponse);

            // Save assistant message
            $conversation->messages()->create([
                'role' => 'assistant',
                'content' => $cleanContent,
                'follow_up_prompts' => $followUpPrompts,
            ]);

            // Send final event
            echo "data: " . json_encode([
                'done' => true,
                'follow_up_prompts' => $followUpPrompts,
            ]) . "\n\n";

            if (ob_get_level() > 0) {
                ob_flush();
            }
            flush();
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache',
            'Connection' => 'keep-alive',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    private function buildSystemPrompt($user): string
    {
        $date = now()->toDateString();
        $appName = config('app.name', 'WMT');

        $instructions = <<<PROMPT
You are {$appName} AI Insights, an intelligent assistant for the {$appName} Workload Management Tool.
You help users understand their workload, project progress, team performance, and organizational metrics.

Guidelines:
- Be concise and actionable. Focus on insights, not data recitation.
- When analyzing workload, consider due dates, priorities, and status distributions.
- Flag at-risk items proactively (overdue tasks, bottlenecks, unbalanced workloads).
- Use markdown formatting: headers, bullet points, bold for emphasis, tables for comparisons.
- When referencing tasks or projects, mention their names.
- Today's date is {$date}.

IMPORTANT: At the end of every response, you MUST include exactly 2-3 follow-up question suggestions that the user might want to ask next. Format them exactly like this, on its own line:

|||FOLLOW_UP|||["Question 1?", "Question 2?", "Question 3?"]|||END_FOLLOW_UP|||

The questions should be contextually relevant to your response and encourage deeper analysis. Do not explain the follow-up block — just include it silently at the very end.
PROMPT;

        $context = AiContextBuilder::build($user);

        return $instructions . "\n\n--- DATA CONTEXT ---\n\n" . $context;
    }

    private function parseFollowUpPrompts(string $response): array
    {
        if (preg_match('/\|\|\|FOLLOW_UP\|\|\|(.*?)\|\|\|END_FOLLOW_UP\|\|\|/s', $response, $matches)) {
            $decoded = json_decode(trim($matches[1]), true);
            if (is_array($decoded)) {
                return array_slice($decoded, 0, 3);
            }
        }

        return [];
    }

    private function stripFollowUpBlock(string $response): string
    {
        return trim(preg_replace('/\|\|\|FOLLOW_UP\|\|\|.*?\|\|\|END_FOLLOW_UP\|\|\|/s', '', $response));
    }
}
