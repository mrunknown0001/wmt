import { usePage, Head, router } from '@inertiajs/react';
import CharacterCounter from '../../Components/CharacterCounter';
import HelpText from '../../Components/HelpText';
import { focusFirstError } from '../../focusFirstError';
import { useState, useCallback } from 'react';
import Input from '../../Components/Input';
import Textarea from '../../Components/Textarea';
import Select from '../../Components/Select';
import Button from '../../Components/Button';
import CameraCapture from '../../Components/CameraCapture';
import TurnstileWidget from '../../Components/TurnstileWidget';
import ThemeToggle from '../../Components/ThemeToggle';

const ACCEPTED_FILE_TYPES = '.pdf,image/*,video/*,.xlsx,.xls,.csv';
const MAX_FILE_SIZE_MB = 50;
const MAX_FILES = 5;

// Per-field limit set in the form editor, clamped to the same 1..5 range the
// server enforces.
const fieldMaxFiles = (field) =>
    Math.max(1, Math.min(MAX_FILES, parseInt(field?.config?.max_files ?? MAX_FILES, 10) || MAX_FILES));

// Identity for de-duplication across separate picks. The File object differs
// between dialogs even for the same file on disk, so compare its properties.
const fileKey = (file) => `${file.name}::${file.size}::${file.lastModified}`;
const NUMBER_MIN = -99999999999;
const NUMBER_MAX = 99999999999;

// Hard-clamp a number field value so typed/pasted out-of-range input snaps back
// into range. Preserves partial input ('', '-') and non-numeric strings (the
// server rule catches those) so the field stays editable while being bounded.
function clampNumber(v) {
    if (v === '' || v === '-') return v;
    const n = Number(v);
    if (Number.isNaN(n)) return v;
    if (n > NUMBER_MAX) return String(NUMBER_MAX);
    if (n < NUMBER_MIN) return String(NUMBER_MIN);
    return v;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function evaluateConditions(field, allFields, fieldValues, visited = new Set()) {
    const conditions = field.conditions;
    if (!conditions || !conditions.rules || conditions.rules.length === 0) {
        return true;
    }

    // Circular reference protection
    if (visited.has(field.id)) return true;
    visited.add(field.id);

    const logic = conditions.logic || 'all';
    const results = conditions.rules.map(rule => {
        const refField = allFields.find(f => f.id === rule.field_id);
        if (!refField) return true;

        // Recursively check if the referenced field is visible
        if (!evaluateConditions(refField, allFields, fieldValues, new Set(visited))) {
            return false;
        }

        const currentValue = fieldValues[refField.id];
        const expectedValue = rule.value;
        const operator = rule.operator || 'equals';

        switch (operator) {
            case 'equals':
                return String(currentValue ?? '') === String(expectedValue ?? '');
            case 'not_equals':
                return String(currentValue ?? '') !== String(expectedValue ?? '');
            case 'contains':
                return String(currentValue ?? '').includes(String(expectedValue ?? ''));
            case 'is_empty':
                return !currentValue || currentValue === '' || (Array.isArray(currentValue) && currentValue.length === 0);
            case 'is_not_empty':
                return currentValue != null && currentValue !== '' && !(Array.isArray(currentValue) && currentValue.length === 0);
            default:
                return true;
        }
    });

    return logic === 'all' ? results.every(Boolean) : results.some(Boolean);
}

const STATIC_FIELD_TYPES = ['heading', 'description'];
const FILE_FIELD_TYPES = ['attachment', 'capture_photo', 'capture_video'];

export default function PublicForm() {
    const { form: formDef, turnstile } = usePage().props;

    // Filter to only visible fields for display
    const visibleFields = formDef.fields.filter(f => f.is_visible !== false);

    // Build initial field values with defaults
    const initialValues = {};
    visibleFields.forEach(field => {
        if (['heading', 'description', 'attachment', 'capture_photo', 'capture_video'].includes(field.type)) return;
        if (field.type === 'multi_select') {
            initialValues[field.id] = field.default_value ? [field.default_value] : [];
        } else {
            initialValues[field.id] = field.default_value || '';
        }
    });

    const [fieldValues, setFieldValues] = useState(initialValues);
    const [attachments, setAttachments] = useState({});
    const [processing, setProcessing] = useState(false);
    const [errors, setErrors] = useState({});
    const [turnstileToken, setTurnstileToken] = useState('');

    const setFieldValue = (fieldId, value) => {
        setFieldValues(prev => ({ ...prev, [fieldId]: value }));
    };

    const handleTurnstileVerify = useCallback((token) => {
        setTurnstileToken(token);
    }, []);

    const handleTurnstileExpire = useCallback(() => {
        setTurnstileToken('');
    }, []);

    /**
     * Files accumulate across picks rather than replacing what is already there.
     * A file dialog only ever reports the files chosen in that one session, so
     * overwriting the list meant a second trip — to another folder — silently
     * discarded everything picked the first time.
     */
    const handleFileChange = (fieldId, files, maxFiles = MAX_FILES) => {
        const picked = Array.from(files);
        if (picked.length === 0) return;

        const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
        const withinSize = picked.filter(f => f.size <= maxBytes);
        const tooBig = picked.length - withinSize.length;

        const existing = attachments[fieldId] || [];
        const seen = new Set(existing.map(fileKey));

        // Re-picking the same file from the same folder shouldn't add it twice.
        const fresh = [];
        let duplicates = 0;
        for (const file of withinSize) {
            const key = fileKey(file);
            if (seen.has(key)) {
                duplicates++;
                continue;
            }
            seen.add(key);
            fresh.push(file);
        }

        const room = Math.max(0, maxFiles - existing.length);
        const accepted = fresh.slice(0, room);
        const overCap = fresh.length - accepted.length;

        if (accepted.length > 0) {
            setAttachments(prev => ({
                ...prev,
                [fieldId]: [...(prev[fieldId] || []), ...accepted],
            }));
        }

        // Report everything that was dropped, at selection time rather than on
        // the server, so nothing disappears without explanation.
        const notes = [];
        if (tooBig > 0) notes.push(`${tooBig} file(s) over ${MAX_FILE_SIZE_MB}MB were skipped.`);
        if (duplicates > 0) notes.push(`${duplicates} already-added file(s) were skipped.`);
        if (overCap > 0) notes.push(`Limit is ${maxFiles} — ${overCap} file(s) were not added.`);

        setErrors(prev => ({
            ...prev,
            [`fields.${fieldId}`]: notes.length ? notes.join(' ') : undefined,
        }));
    };

    const removeFile = (fieldId, index) => {
        setAttachments(prev => {
            const files = [...(prev[fieldId] || [])];
            files.splice(index, 1);
            return { ...prev, [fieldId]: files };
        });

        // Drop any "limit reached" / "skipped" note — removing a file makes room,
        // so leaving the old message up would contradict the field's actual state.
        setErrors(prev => ({ ...prev, [`fields.${fieldId}`]: undefined }));
    };

    /** The questions on screen right now, in the order they are asked. */
    const askedFields = () => visibleFields.filter(
        (f) => !STATIC_FIELD_TYPES.includes(f.type) && evaluateConditions(f, formDef.fields, fieldValues)
    );

    /** Whether a required question has been answered. */
    const isAnswered = (field) => {
        if (FILE_FIELD_TYPES.includes(field.type)) {
            return (attachments[field.id] || []).length > 0;
        }

        const value = fieldValues[field.id];

        return Array.isArray(value) ? value.length > 0 : String(value ?? '').trim() !== '';
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        // Checked here as well as on the server so somebody who missed a
        // question is taken to it rather than to the top of a page they have
        // already filled in, and without a round trip to be told so.
        const asked = askedFields();
        const missing = asked.filter((f) => f.is_required && !isAnswered(f));

        if (missing.length > 0) {
            const message = 'This field is required.';
            setErrors(Object.fromEntries(missing.map((f) => [`fields.${f.id}`, message])));
            focusFirstError(asked.map((f) => f.id), (id) => missing.some((f) => f.id === id));

            return;
        }

        setProcessing(true);

        const formData = new FormData();

        // Add field values (only for fields whose conditions are met)
        Object.entries(fieldValues).forEach(([fieldId, value]) => {
            const field = formDef.fields.find(f => f.id === Number(fieldId));
            if (field && !evaluateConditions(field, formDef.fields, fieldValues)) {
                return; // Skip hidden conditional fields
            }
            if (Array.isArray(value)) {
                value.forEach(v => formData.append(`fields[${fieldId}][]`, v));
            } else {
                formData.append(`fields[${fieldId}]`, value ?? '');
            }
        });

        // Add attachment files
        Object.entries(attachments).forEach(([fieldId, files]) => {
            files.forEach(file => {
                formData.append(`fields[${fieldId}][]`, file);
            });
        });

        // Add Turnstile token
        if (turnstileToken) {
            formData.append('cf_turnstile_response', turnstileToken);
        }

        router.post(`/forms/${formDef.uuid}`, formData, {
            forceFormData: true,
            onError: (errs) => {
                setErrors(errs);
                setProcessing(false);
                // The server can refuse a field the browser was happy with — a
                // rule the form does not know about, or a file it would not take.
                focusFirstError(askedFields().map((f) => f.id), (id) => Boolean(errs[`fields.${id}`]));
            },
            onFinish: () => {
                setProcessing(false);
            },
        });
    };

    const renderField = (field) => {
        const value = fieldValues[field.id];
        const fieldError = errors[`fields.${field.id}`];

        switch (field.type) {
            case 'heading':
                return (
                    <h2 key={field.id} className="text-lg font-semibold text-gray-900 dark:text-gray-100 pt-2">
                        {field.label}
                    </h2>
                );

            case 'description':
                return (
                    <p key={field.id} className="text-sm text-gray-600 dark:text-gray-400">
                        {field.label}
                    </p>
                );

            case 'email':
                return (
                    <div key={field.id} id={`field-wrap-${field.id}`}>
                        <Input
                            label={field.label + (field.is_required ? ' *' : '')}
                            id={`field-${field.id}`}
                            type="email"
                            value={value || ''}
                            onChange={(e) => setFieldValue(field.id, e.target.value)}
                            error={fieldError}
                            placeholder={field.config?.placeholder || ''}
                            maxLength={255}
                        />
                        {field.config?.email_mode === 'registered_user' && (
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Must be a registered user's email address.</p>
                        )}
                        <CharacterCounter used={(value || '').length} limit={255} help={<HelpText className="text-xs text-gray-500 dark:text-gray-400">{field.help_text}</HelpText>} />
                    </div>
                );

            case 'text':
                return (
                    <div key={field.id} id={`field-wrap-${field.id}`}>
                        <Input
                            label={field.label + (field.is_required ? ' *' : '')}
                            id={`field-${field.id}`}
                            value={value || ''}
                            onChange={(e) => setFieldValue(field.id, e.target.value)}
                            error={fieldError}
                            placeholder={field.config?.placeholder || ''}
                            maxLength={255}
                        />
                        <CharacterCounter used={(value || '').length} limit={255} help={<HelpText className="text-xs text-gray-500 dark:text-gray-400">{field.help_text}</HelpText>} />
                    </div>
                );

            case 'textarea':
                return (
                    <div key={field.id} id={`field-wrap-${field.id}`}>
                        <Textarea
                            label={field.label + (field.is_required ? ' *' : '')}
                            id={`field-${field.id}`}
                            value={value || ''}
                            onChange={(e) => setFieldValue(field.id, e.target.value)}
                            error={fieldError}
                            placeholder={field.config?.placeholder || ''}
                            maxLength={10000}
                        />
                        <CharacterCounter used={(value || '').length} limit={10000} help={<HelpText className="text-xs text-gray-500 dark:text-gray-400">{field.help_text}</HelpText>} />
                    </div>
                );

            case 'number':
                return (
                    <div key={field.id} id={`field-wrap-${field.id}`}>
                        <Input
                            label={field.label + (field.is_required ? ' *' : '')}
                            id={`field-${field.id}`}
                            type="number"
                            value={value ?? ''}
                            onChange={(e) => setFieldValue(field.id, clampNumber(e.target.value))}
                            error={fieldError}
                            max={NUMBER_MAX}
                            min={NUMBER_MIN}
                        />
                        <HelpText>{field.help_text}</HelpText>
                    </div>
                );

            case 'date':
                return (
                    <div key={field.id} id={`field-wrap-${field.id}`}>
                        <Input
                            label={field.label + (field.is_required ? ' *' : '')}
                            id={`field-${field.id}`}
                            type="date"
                            value={value || ''}
                            onChange={(e) => setFieldValue(field.id, e.target.value)}
                            error={fieldError}
                        />
                        <HelpText>{field.help_text}</HelpText>
                    </div>
                );

            case 'select':
                return (
                    <div key={field.id} id={`field-wrap-${field.id}`}>
                        <Select
                            label={field.label + (field.is_required ? ' *' : '')}
                            id={`field-${field.id}`}
                            value={value || ''}
                            onChange={(e) => setFieldValue(field.id, e.target.value)}
                            options={[...(field.options || [])].sort((a, b) =>
                                field.sort_mode === 'manual' ? (a.position ?? 0) - (b.position ?? 0) : a.label.localeCompare(b.label)
                            ).map(opt => ({
                                value: String(opt.id ?? opt.value),
                                label: opt.label,
                            }))}
                            placeholder="— Select —"
                            error={fieldError}
                        />
                        <HelpText>{field.help_text}</HelpText>
                    </div>
                );

            // People is a single-select dropdown: one person per field. The
            // option list is the staff directory narrowed by the field's scope,
            // which reads far better as a dropdown than as a wall of checkboxes.
            case 'people':
                return (
                    <div key={field.id} id={`field-wrap-${field.id}`}>
                        <Select
                            label={field.label + (field.is_required ? ' *' : '')}
                            id={`field-${field.id}`}
                            value={Array.isArray(value) ? (value[0] ?? '') : (value || '')}
                            onChange={(e) => setFieldValue(field.id, e.target.value)}
                            options={[...(field.options || [])]
                                .sort((a, b) => a.label.localeCompare(b.label))
                                .map(opt => ({ value: String(opt.id), label: opt.label }))}
                            placeholder={(field.options || []).length ? '— Select —' : 'No one available'}
                            error={fieldError}
                        />
                        <HelpText>{field.help_text}</HelpText>
                    </div>
                );

            case 'multi_select': {
                const selected = Array.isArray(value) ? value.map(String) : [];
                return (
                    <div key={field.id} id={`field-wrap-${field.id}`}>
                        <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                            {field.label}{field.is_required ? ' *' : ''}
                        </label>
                        <div className="space-y-1">
                            {[...(field.options || [])].sort((a, b) =>
                                field.sort_mode === 'manual' ? (a.position ?? 0) - (b.position ?? 0) : a.label.localeCompare(b.label)
                            ).map(opt => {
                                const optVal = String(opt.id ?? opt.value);
                                return (
                                    <label key={optVal} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                        <input
                                            type="checkbox"
                                            checked={selected.includes(optVal)}
                                            onChange={() => {
                                                const newSelected = selected.includes(optVal)
                                                    ? selected.filter(s => s !== optVal)
                                                    : [...selected, optVal];
                                                setFieldValue(field.id, newSelected);
                                            }}
                                            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700"
                                        />
                                        {opt.label}
                                    </label>
                                );
                            })}
                        </div>
                        {fieldError && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{fieldError}</p>}
                        <HelpText>{field.help_text}</HelpText>
                    </div>
                );
            }

            case 'attachment': {
                const files = attachments[field.id] || [];
                const maxFiles = fieldMaxFiles(field);
                const fileErrors = [];
                for (let i = 0; i < maxFiles; i++) {
                    if (errors[`fields.${field.id}.${i}`]) {
                        fileErrors.push(errors[`fields.${field.id}.${i}`]);
                    }
                }
                return (
                    <div key={field.id} id={`field-wrap-${field.id}`}>
                        <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                            {field.label}{field.is_required ? ' *' : ''}
                        </label>
                        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4">
                            <input
                                type="file"
                                accept={ACCEPTED_FILE_TYPES}
                                multiple={maxFiles > 1}
                                disabled={files.length >= maxFiles}
                                onChange={(e) => {
                                    handleFileChange(field.id, e.target.files, maxFiles);
                                    // Clear the native selection so the same file can be
                                    // picked again after being removed — the accumulated
                                    // list below is the source of truth, not this input.
                                    e.target.value = '';
                                }}
                                className="block w-full text-sm text-gray-500 dark:text-gray-400
                                    file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0
                                    file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700
                                    dark:file:bg-primary-900/20 dark:file:text-primary-400
                                    hover:file:bg-primary-100 dark:hover:file:bg-primary-900/30
                                    file:cursor-pointer file:transition-colors
                                    disabled:opacity-50 disabled:file:cursor-not-allowed"
                            />
                            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                                PDF, images, videos, or Excel files. Max {maxFiles} {maxFiles === 1 ? 'file' : 'files'}, {MAX_FILE_SIZE_MB}MB each.
                                {maxFiles > 1 && (
                                    files.length >= maxFiles
                                        ? ' Limit reached — remove a file to add another.'
                                        : files.length > 0
                                            ? ` ${maxFiles - files.length} more can be added — pick again to add from another folder.`
                                            : ' You can add files from more than one folder.'
                                )}
                            </p>
                            {files.length > 0 && (
                                <div className="mt-3 space-y-1">
                                    {files.map((file, i) => (
                                        <div key={i} className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded px-3 py-1.5">
                                            <span className="truncate">{file.name} ({formatFileSize(file.size)})</span>
                                            <button
                                                type="button"
                                                onClick={() => removeFile(field.id, i)}
                                                className="text-gray-400 hover:text-red-500 ml-2 shrink-0"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        {fieldError && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{fieldError}</p>}
                        {fileErrors.map((err, i) => (
                            <p key={i} className="mt-1 text-sm text-red-600 dark:text-red-400">{err}</p>
                        ))}
                        <HelpText>{field.help_text}</HelpText>
                    </div>
                );
            }

            case 'capture_photo': {
                const files = attachments[field.id] || [];
                const maxPhotos = fieldMaxFiles(field);
                return (
                    <div key={field.id} id={`field-wrap-${field.id}`}>
                        <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                            {field.label}{field.is_required ? ' *' : ''}
                        </label>
                        <CameraCapture
                            mode="photo"
                            maxPhotos={maxPhotos}
                            existingFiles={files}
                            onCapture={(file) => {
                                setAttachments(prev => {
                                    const existing = prev[field.id] || [];
                                    if (existing.length >= maxPhotos) return prev;
                                    return { ...prev, [field.id]: [...existing, file] };
                                });
                            }}
                            onRemove={(index) => removeFile(field.id, index)}
                        />
                        {fieldError && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{fieldError}</p>}
                        <HelpText>{field.help_text}</HelpText>
                    </div>
                );
            }

            case 'capture_video': {
                const files = attachments[field.id] || [];
                return (
                    <div key={field.id} id={`field-wrap-${field.id}`}>
                        <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                            {field.label}{field.is_required ? ' *' : ''}
                        </label>
                        <CameraCapture
                            mode="video"
                            maxVideoDuration={60}
                            existingFiles={files}
                            onCapture={(file) => {
                                setAttachments(prev => ({
                                    ...prev,
                                    [field.id]: [file],
                                }));
                            }}
                            onRemove={() => {
                                setAttachments(prev => ({
                                    ...prev,
                                    [field.id]: [],
                                }));
                            }}
                        />
                        {fieldError && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{fieldError}</p>}
                        <HelpText>{field.help_text}</HelpText>
                    </div>
                );
            }

            default:
                return null;
        }
    };

    return (
        <>
            <Head title={formDef.name} />
            <div className="h-screen overflow-y-auto bg-gray-50 dark:bg-gray-900 py-8 px-4">
                <div className="fixed top-4 right-4 z-10">
                    <ThemeToggle className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" />
                </div>
                <div className="w-full max-w-2xl mx-auto">
                    <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                        {formDef.banner_url && (
                            <img src={formDef.banner_url} alt="" className="w-full h-40 sm:h-48 object-cover" />
                        )}
                        <div className="px-8 py-8">
                        <div className="mb-6">
                            {formDef.logo_url && (
                                <div className={`mb-4 flex ${formDef.logo_position === 'center' ? 'justify-center' : formDef.logo_position === 'right' ? 'justify-end' : 'justify-start'}`}>
                                    <img src={formDef.logo_url} alt="" className="max-h-16 object-contain" />
                                </div>
                            )}
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{formDef.project_name}</p>
                            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{formDef.name}</h1>
                            <HelpText className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                                {formDef.description}
                            </HelpText>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-5" encType="multipart/form-data">
                            {visibleFields.map(field => {
                                if (!evaluateConditions(field, formDef.fields, fieldValues)) return null;
                                return renderField(field);
                            })}

                            {turnstile.enabled && (
                                <TurnstileWidget
                                    siteKey={turnstile.siteKey}
                                    onVerify={handleTurnstileVerify}
                                    onExpire={handleTurnstileExpire}
                                    error={errors.cf_turnstile_response}
                                />
                            )}

                            <Button
                                type="submit"
                                processing={processing}
                                processingText="Submitting..."
                                className="w-full"
                            >
                                {formDef.submit_button_text || 'Submit'}
                            </Button>
                        </form>
                    </div>
                    </div>

                    <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-4">
                        Powered by WMT
                    </p>
                </div>
            </div>
        </>
    );
}
