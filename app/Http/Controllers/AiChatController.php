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

        $conversation->load(['messages.attachments:id,ai_message_id,file_name,kind,file_size']);

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
            'content' => 'required_without:attachments|nullable|string|max:4000',
            'attachments' => 'nullable|array|max:5',
            'attachments.*' => 'file|max:20480|mimes:jpg,jpeg,png,webp,gif,pdf,docx,xls,xlsx,csv',
        ]);

        if ($conversation->hasReachedLimit()) {
            return response()->json([
                'error' => 'Message limit reached. Please start a new conversation.',
            ], 422);
        }

        // Read each attachment: images/PDFs become AI content parts (this turn only),
        // documents/spreadsheets are extracted to text stored on the attachment so
        // later turns can replay it.
        $reader = new \App\Services\AiAttachmentReader();
        $userText = trim((string) ($validated['content'] ?? ''));
        $mediaParts = [];   // image/file parts sent only on this turn
        $attachmentRecords = [];

        foreach ($request->file('attachments', []) as $file) {
            if (!$file || !$file->isValid()) {
                continue;
            }
            $result = $reader->read($file, "ai-attachments/{$conversation->id}");
            $record = $result['stored'];
            $record['extracted_text'] = $result['text'] ?? null;
            $attachmentRecords[] = $record;

            if (isset($result['part'])) {
                $mediaParts[] = $result['part'];
            }
        }

        // The chat bubble shows only the user's prompt; extracted text lives on the
        // attachment records, not in the visible message.
        $storedContent = $userText !== '' ? $userText : '(attachment only)';

        $userMessage = $conversation->messages()->create([
            'role' => 'user',
            'content' => $storedContent,
        ]);
        foreach ($attachmentRecords as $att) {
            $userMessage->attachments()->create($att);
        }

        $conversation->increment('user_message_count');
        $conversation->refresh();

        // Auto-title on first message
        if ($conversation->user_message_count === 1) {
            $conversation->update([
                'title' => Str::limit($userText !== '' ? $userText : ($attachmentRecords[0]['file_name'] ?? 'Attachment'), 80),
            ]);
        }

        // Build context
        $user = $request->user();
        $systemPrompt = $this->buildSystemPrompt($user);

        // Build message history, folding each message's extracted attachment text
        // back into its content so the model retains document context across turns.
        $messageHistory = $conversation->messages()
            ->with('attachments:id,ai_message_id,file_name,kind,extracted_text')
            ->orderBy('id')
            ->get()
            ->map(function ($m) {
                $content = $m->content;
                foreach ($m->attachments as $att) {
                    if ($att->extracted_text) {
                        $content .= "\n\n" . $att->extracted_text;
                    } elseif ($att->kind !== 'text') {
                        $content .= "\n[" . ($att->kind === 'image' ? 'Image' : 'File') . ": {$att->file_name}]";
                    }
                }
                return ['role' => $m->role, 'content' => trim($content)];
            })
            ->toArray();

        // For this turn, attach image/PDF parts to the final user message so the
        // model can actually see them (binary isn't reconstructable from history).
        if (!empty($mediaParts) && !empty($messageHistory)) {
            $lastIndex = count($messageHistory) - 1;
            $messageHistory[$lastIndex]['content'] = array_merge(
                [['type' => 'text', 'text' => $messageHistory[$lastIndex]['content']]],
                $mediaParts,
            );
        }

        $hasPdf = collect($mediaParts)->contains(fn ($p) => ($p['type'] ?? '') === 'file');
        $hasImage = collect($mediaParts)->contains(fn ($p) => ($p['type'] ?? '') === 'image_url');
        $hasDocument = collect($attachmentRecords)->contains(fn ($a) => !empty($a['extracted_text']));

        // Auto-route this turn to the appropriate model.
        $route = \App\Services\AiModelRouter::route($hasImage || $hasPdf, $hasDocument, $userText);
        $streamOptions = [
            'has_pdf' => $hasPdf,
            'model' => $route['model'],
            'max_tokens' => $route['max_tokens'],
        ];

        return response()->stream(function () use ($systemPrompt, $messageHistory, $conversation, $streamOptions, $route) {
            $fullResponse = '';

            foreach (AiChatService::streamChat($systemPrompt, $messageHistory, $streamOptions) as $chunk) {
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
                'model' => $route['model'],
                'purpose' => $route['purpose'],
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
