<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PhpOffice\PhpSpreadsheet\IOFactory;

/**
 * Turns an uploaded file into something the AI can consume:
 *  - images  → an image_url content part (vision models)
 *  - PDFs    → a file content part (OpenRouter parses these natively)
 *  - DOCX / spreadsheets → extracted plain text embedded in the prompt
 *
 * Text extraction is preferred where reliable because it persists in the message
 * history and works with any text model; images and PDFs are per-turn.
 */
class AiAttachmentReader
{
    private const MAX_TEXT_CHARS = 20000;

    private const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

    /**
     * @return array{
     *   kind: string, note: string,
     *   part?: array, text?: string,
     *   stored: array{file_name:string,file_path:string,file_type:?string,file_size:int}
     * }
     */
    public function read(UploadedFile $file, string $dir): array
    {
        $name = $file->getClientOriginalName();
        $ext = strtolower($file->getClientOriginalExtension());
        $mime = $file->getMimeType();
        $size = $file->getSize();

        // Persist a copy for audit/history before the file handle is consumed.
        $path = $file->store($dir, 'local');

        $stored = [
            'file_name' => $name,
            'file_path' => $path,
            'file_type' => $mime,
            'file_size' => (int) $size,
        ];

        $contents = Storage::disk('local')->get($path);

        if (in_array($ext, self::IMAGE_EXT, true) || str_starts_with((string) $mime, 'image/')) {
            $dataUrl = 'data:' . ($mime ?: 'image/png') . ';base64,' . base64_encode($contents);
            return [
                'kind' => 'image',
                'note' => "[Image attached: {$name}]",
                'part' => ['type' => 'image_url', 'image_url' => ['url' => $dataUrl]],
                'stored' => ['kind' => 'image'] + $stored,
            ];
        }

        if ($ext === 'pdf' || $mime === 'application/pdf') {
            $dataUrl = 'data:application/pdf;base64,' . base64_encode($contents);
            return [
                'kind' => 'file',
                'note' => "[PDF attached: {$name}]",
                // OpenRouter's documented file part; the model/router parses the PDF.
                'part' => ['type' => 'file', 'file' => ['filename' => $name, 'file_data' => $dataUrl]],
                'stored' => ['kind' => 'file'] + $stored,
            ];
        }

        if ($ext === 'docx') {
            return $this->asText($name, $this->extractDocx($contents), $stored);
        }

        if (in_array($ext, ['xlsx', 'xls', 'csv'], true)) {
            return $this->asText($name, $this->extractSpreadsheet($path), $stored);
        }

        return [
            'kind' => 'unsupported',
            'note' => "[Unsupported attachment: {$name}]",
            'text' => "The file \"{$name}\" is an unsupported type and could not be read.",
            'stored' => ['kind' => 'text'] + $stored,
        ];
    }

    private function asText(string $name, string $text, array $stored): array
    {
        $text = trim($text);
        if ($text === '') {
            $text = '(No readable text found in this file.)';
        }
        if (mb_strlen($text) > self::MAX_TEXT_CHARS) {
            $text = mb_substr($text, 0, self::MAX_TEXT_CHARS) . "\n…(truncated)";
        }

        return [
            'kind' => 'text',
            'note' => "[File attached: {$name}]",
            'text' => "--- Contents of attached file \"{$name}\" ---\n{$text}\n--- end of {$name} ---",
            'stored' => ['kind' => 'text'] + $stored,
        ];
    }

    /** DOCX is a zip; the body text lives in word/document.xml. */
    private function extractDocx(string $binary): string
    {
        $tmp = tempnam(sys_get_temp_dir(), 'docx');
        file_put_contents($tmp, $binary);

        $text = '';
        $zip = new \ZipArchive();
        if ($zip->open($tmp) === true) {
            $xml = $zip->getFromName('word/document.xml');
            $zip->close();
            if ($xml !== false) {
                // Preserve paragraph/line breaks, then strip the remaining tags.
                $xml = preg_replace('/<w:(p|br|tab)\b[^>]*>/', "\n", $xml);
                $text = trim(html_entity_decode(strip_tags($xml), ENT_QUOTES | ENT_XML1));
                $text = preg_replace("/\n{3,}/", "\n\n", $text);
            }
        }
        @unlink($tmp);

        return $text;
    }

    /** Render every sheet as tab-separated rows. */
    private function extractSpreadsheet(string $path): string
    {
        $full = Storage::disk('local')->path($path);
        $spreadsheet = IOFactory::load($full);
        $out = [];

        foreach ($spreadsheet->getAllSheets() as $sheet) {
            $out[] = "# Sheet: " . $sheet->getTitle();
            foreach ($sheet->toArray(null, true, false, false) as $row) {
                $cells = array_map(fn ($c) => $c === null ? '' : (string) $c, $row);
                if (trim(implode('', $cells)) === '') {
                    continue;
                }
                $out[] = implode("\t", $cells);
            }
            $out[] = '';
        }

        return implode("\n", $out);
    }
}
