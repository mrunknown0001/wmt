<?php

namespace App\Http\Controllers;

use App\Models\CustomField;
use App\Models\CustomFieldOption;
use App\Models\Project;
use App\Models\Task;
use Illuminate\Http\Request;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Color;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ExportController extends Controller
{
    public function projectTasks(Project $project): StreamedResponse
    {
        $this->authorize('view', $project);

        $user = auth()->user();
        $userId = auth()->id();
        $isOwner = $project->owner_id === $userId;
        $isMember = $project->members()->where('users.id', $userId)->exists();
        $hasFullAccess = $user->can('manage-projects') || $isOwner || $isMember;

        $taskQuery = $project->tasks()->whereNull('parent_id');

        if ($hasFullAccess) {
            $tasks = $taskQuery
                ->with(['assignee', 'creator', 'section', 'subtasks.assignee', 'subtasks.creator', 'subtasks.section',
                    'customFieldValues.selectedOption', 'customFieldValues.customField',
                    'subtasks.customFieldValues.selectedOption', 'subtasks.customFieldValues.customField'])
                ->orderBy('position')
                ->orderBy('created_at', 'desc')
                ->get();
        } else {
            $tasks = $taskQuery
                ->where(function ($q) use ($userId) {
                    $q->where('assigned_to', $userId)
                        ->orWhereHas('subtasks', fn ($s) => $s->where('assigned_to', $userId));
                })
                ->with(['assignee', 'creator', 'section',
                    'subtasks' => fn ($q) => $q->where('assigned_to', $userId),
                    'subtasks.assignee', 'subtasks.creator', 'subtasks.section',
                    'customFieldValues.selectedOption', 'customFieldValues.customField',
                    'subtasks.customFieldValues.selectedOption', 'subtasks.customFieldValues.customField'])
                ->orderBy('position')
                ->orderBy('created_at', 'desc')
                ->get();
        }

        $customFields = $project->customFields()->with('options')->orderBy('position')->get();

        // Parent tasks only (no subtasks)
        $flatTasks = [];
        foreach ($tasks as $task) {
            $flatTasks[] = ['task' => $task, 'isSubtask' => false];
        }

        $filename = preg_replace('/[^A-Za-z0-9_\- ]/', '', $project->name) . '_' . now()->format('Y-m-d') . '.xlsx';

        return $this->generateExcel($flatTasks, $customFields, $project->name, $filename);
    }

    public function myTasks(Request $request): StreamedResponse
    {
        $user = auth()->user();
        $today = now()->startOfDay();

        $query = Task::with(['project', 'assignee', 'creator', 'section',
                'customFieldValues.selectedOption', 'customFieldValues.customField'])
            ->where('assigned_to', $user->id);

        if ($search = $request->query('search')) {
            $query->where('title', 'like', "%{$search}%");
        }
        if ($status = $request->query('status')) {
            $query->where('status', $status);
        } else {
            $query->whereNotIn('status', ['done', 'cancelled']);
        }
        if ($priority = $request->query('priority')) {
            $query->where('priority', $priority);
        }

        $tasks = $query
            ->orderByRaw('CASE WHEN due_date IS NULL THEN 1 ELSE 0 END')
            ->orderBy('due_date')
            ->orderBy('priority', 'desc')
            ->get();

        // Collect all custom fields from the projects these tasks belong to
        $projectIds = $tasks->pluck('project_id')->filter()->unique();
        $customFields = CustomField::whereIn('project_id', $projectIds)
            ->with('options')
            ->orderBy('position')
            ->get();

        $flatTasks = $tasks->map(fn ($t) => ['task' => $t, 'isSubtask' => false])->toArray();

        $filename = 'My_Tasks_' . now()->format('Y-m-d') . '.xlsx';

        return $this->generateExcel($flatTasks, $customFields, 'My Tasks', $filename, true);
    }

    private function generateExcel(array $flatTasks, $customFields, string $title, string $filename, bool $showProject = false): StreamedResponse
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Tasks');

        // --- Row 1: Title ---
        $sheet->setCellValue('A1', $title);
        $sheet->getStyle('A1')->getFont()->setBold(true)->setSize(18);
        $sheet->getStyle('A1')->getAlignment()->setVertical(Alignment::VERTICAL_CENTER);

        // "Powered by WMT" next to the title
        $sheet->setCellValue('D1', 'Powered by WMT');
        $sheet->getStyle('D1')->getFont()->setSize(10)->setItalic(true)->setColor(new Color('808080'));
        $sheet->getRowDimension(1)->setRowHeight(30);

        // --- Row 3: Headers ---
        $headerRow = 3;
        $col = 0;

        $baseHeaders = ['Title', 'Description', 'Status', 'Priority', 'Assignee', 'Created By', 'Start Date', 'Due Date', 'Completed At', 'Section'];
        if ($showProject) {
            array_splice($baseHeaders, 1, 0, ['Project']);
        }

        foreach ($baseHeaders as $header) {
            $cellCoord = $this->colLetter($col) . $headerRow;
            $sheet->setCellValue($cellCoord, $header);
            $col++;
        }

        // Custom field headers
        $cfStartCol = $col;
        foreach ($customFields as $cf) {
            $cellCoord = $this->colLetter($col) . $headerRow;
            $sheet->setCellValue($cellCoord, $cf->name);
            $col++;
        }

        $lastCol = $this->colLetter($col - 1);

        // Style header row
        $headerRange = 'A' . $headerRow . ':' . $lastCol . $headerRow;
        $sheet->getStyle($headerRange)->getFont()->setBold(true)->setSize(12);
        $sheet->getStyle($headerRange)->getAlignment()->setVertical(Alignment::VERTICAL_CENTER);
        $sheet->getStyle($headerRange)->getFill()
            ->setFillType(Fill::FILL_SOLID)
            ->getStartColor()->setARGB('F3F4F6');
        $sheet->getRowDimension($headerRow)->setRowHeight(25);

        // --- Data rows ---
        $dataRow = $headerRow + 1;

        // Pre-load all option colors for quick lookup
        $optionMap = [];
        foreach ($customFields as $cf) {
            foreach ($cf->options as $option) {
                $optionMap[$option->id] = $option;
            }
        }

        foreach ($flatTasks as $entry) {
            $task = $entry['task'];
            $isSubtask = $entry['isSubtask'];

            $col = 0;
            $titleValue = $isSubtask ? '↳ ' . $task->title : $task->title;

            $sheet->setCellValue($this->colLetter($col++) . $dataRow, $titleValue);

            if ($showProject) {
                $sheet->setCellValue($this->colLetter($col++) . $dataRow, $task->project?->name ?? '—');
            }

            $sheet->setCellValue($this->colLetter($col++) . $dataRow, strip_tags($task->description ?? ''));
            $sheet->setCellValue($this->colLetter($col++) . $dataRow, $this->formatLabel($task->status));
            $sheet->setCellValue($this->colLetter($col++) . $dataRow, $this->formatLabel($task->priority));
            $sheet->setCellValue($this->colLetter($col++) . $dataRow, $task->assignee?->name ?? '');
            $sheet->setCellValue($this->colLetter($col++) . $dataRow, $task->creator?->name ?? '');
            $sheet->setCellValue($this->colLetter($col++) . $dataRow, $task->start_date?->format('Y-m-d') ?? '');
            $sheet->setCellValue($this->colLetter($col++) . $dataRow, $task->due_date?->format('Y-m-d') ?? '');
            $sheet->setCellValue($this->colLetter($col++) . $dataRow, $task->completed_at?->format('Y-m-d H:i') ?? '');
            $sheet->setCellValue($this->colLetter($col++) . $dataRow, $task->section?->name ?? '');

            // Custom field values
            foreach ($customFields as $cf) {
                $cellCoord = $this->colLetter($col) . $dataRow;
                $cfValue = $task->customFieldValues->firstWhere('custom_field_id', $cf->id);

                if ($cfValue) {
                    switch ($cf->type) {
                        case 'single_select':
                            $option = $cfValue->selectedOption;
                            if ($option) {
                                $sheet->setCellValue($cellCoord, $option->label);
                                if ($option->color) {
                                    $this->applyCellColor($sheet, $cellCoord, $option->color);
                                }
                            }
                            break;

                        case 'multi_select':
                            $selectedIds = $cfValue->value_json ?? [];
                            if (!empty($selectedIds)) {
                                $selectedOptions = $cf->options->whereIn('id', $selectedIds);
                                $labels = $selectedOptions->pluck('label')->implode(', ');
                                $sheet->setCellValue($cellCoord, $labels);
                                // Apply color of first selected option
                                $firstOption = $selectedOptions->first();
                                if ($firstOption && $firstOption->color) {
                                    $this->applyCellColor($sheet, $cellCoord, $firstOption->color);
                                }
                            }
                            break;

                        case 'date':
                            $sheet->setCellValue($cellCoord, $cfValue->value_date?->format('Y-m-d') ?? '');
                            break;

                        case 'number':
                            $sheet->setCellValue($cellCoord, $cfValue->value_number);
                            break;

                        default: // text, textarea
                            $sheet->setCellValue($cellCoord, $cfValue->value_text ?? '');
                            break;
                    }
                }

                $col++;
            }

            // Indent subtask rows slightly
            if ($isSubtask) {
                $sheet->getStyle('A' . $dataRow)->getFont()->setColor(new Color('6B7280'));
            }

            $dataRow++;
        }

        // Auto-size columns
        $totalCols = count($baseHeaders) + count($customFields);
        for ($i = 0; $i < $totalCols; $i++) {
            $sheet->getColumnDimension($this->colLetter($i))->setAutoSize(true);
        }

        // Freeze header row
        $sheet->freezePane('A' . ($headerRow + 1));

        return $this->downloadResponse($spreadsheet, $filename);
    }

    private function applyCellColor($sheet, string $cellCoord, string $hexColor): void
    {
        // Strip # if present
        $hex = ltrim($hexColor, '#');

        // Ensure 6-char hex
        if (strlen($hex) === 3) {
            $hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
        }

        if (strlen($hex) !== 6) {
            return;
        }

        $sheet->getStyle($cellCoord)->getFill()
            ->setFillType(Fill::FILL_SOLID)
            ->getStartColor()->setARGB($hex);

        // Set font color to white or black based on background brightness
        $r = hexdec(substr($hex, 0, 2));
        $g = hexdec(substr($hex, 2, 2));
        $b = hexdec(substr($hex, 4, 2));
        $brightness = ($r * 299 + $g * 587 + $b * 114) / 1000;

        $fontColor = $brightness < 128 ? 'FFFFFF' : '000000';
        $sheet->getStyle($cellCoord)->getFont()->setColor(new Color($fontColor));
    }

    private function colLetter(int $index): string
    {
        $letter = '';
        $index++;
        while ($index > 0) {
            $index--;
            $letter = chr(65 + ($index % 26)) . $letter;
            $index = intdiv($index, 26);
        }
        return $letter;
    }

    private function formatLabel(string $value = null): string
    {
        if (!$value) {
            return '';
        }
        return ucwords(str_replace('_', ' ', $value));
    }

    private function downloadResponse(Spreadsheet $spreadsheet, string $filename): StreamedResponse
    {
        $writer = new Xlsx($spreadsheet);

        return response()->streamDownload(function () use ($writer) {
            $writer->save('php://output');
        }, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Cache-Control' => 'max-age=0',
        ]);
    }
}
