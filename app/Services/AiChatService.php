<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

class AiChatService
{
    /**
     * Stream a chat completion from the configured AI platform.
     *
     * @return \Generator<string> yields content chunks
     */
    public static function streamChat(string $systemPrompt, array $messageHistory): \Generator
    {
        $platform = config('ai.platform', 'openai');
        $config = config("ai.{$platform}");

        if (empty($config['api_key'])) {
            yield "AI is not configured. Please set your API key in the .env file.";
            return;
        }

        $headers = [
            'Authorization' => "Bearer {$config['api_key']}",
            'Content-Type' => 'application/json',
        ];

        if ($platform === 'openrouter') {
            $headers['HTTP-Referer'] = config('app.url', 'http://localhost');
            $headers['X-Title'] = config('app.name', 'WMT');
        }

        $response = Http::withHeaders($headers)
            ->withOptions(['stream' => true])
            ->timeout(60)
            ->post("{$config['base_url']}/chat/completions", [
                'model' => $config['model'],
                'messages' => [
                    ['role' => 'system', 'content' => $systemPrompt],
                    ...$messageHistory,
                ],
                'stream' => true,
                'temperature' => 0.7,
                'max_tokens' => 2000,
            ]);

        if ($response->failed()) {
            yield "Sorry, I encountered an error communicating with the AI service. Please try again.";
            return;
        }

        $body = $response->getBody();
        $buffer = '';

        while (!$body->eof()) {
            $chunk = $body->read(1024);
            if ($chunk === false || $chunk === '') {
                continue;
            }

            $buffer .= $chunk;

            while (($newlinePos = strpos($buffer, "\n")) !== false) {
                $line = substr($buffer, 0, $newlinePos);
                $buffer = substr($buffer, $newlinePos + 1);

                $line = trim($line);
                if ($line === '' || !str_starts_with($line, 'data: ')) {
                    continue;
                }

                $data = substr($line, 6);
                if ($data === '[DONE]') {
                    return;
                }

                $json = json_decode($data, true);
                if (!$json) {
                    continue;
                }

                $delta = $json['choices'][0]['delta']['content'] ?? '';
                if ($delta !== '') {
                    yield $delta;
                }
            }
        }
    }
}
