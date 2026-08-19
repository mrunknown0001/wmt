import { Head, Link, useForm } from '@inertiajs/react';
import { useRef, useState } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';
import CameraCapture from '../../Components/CameraCapture';

// Mirrors StoreApprovalItemRequest: attachments|array|max:5 and
// attachments.*|file|max:51200|mimes:pdf,doc,docx,xls,xlsx,zip,jpg,jpeg,png.
// Kept in step with the server so the cap is felt before a rejected submit.
const MAX_FILES = 5;
const ACCEPTED = '.pdf,.doc,.docx,.xls,.xlsx,.zip,.jpg,.jpeg,.png';

export default function Create({ project }) {
    // Camera or file picker — both feed the same attachments array, so a
    // request can carry a photo taken now alongside a document chosen from
    // disk. Only the input on screen changes.
    const [source, setSource] = useState('upload');
    const fileInputRef = useRef(null);
    const { data, setData, post, processing, errors } = useForm({
        title: '',
        description: '',
        approval_section_id: '',
        customFieldValues: {},
        attachments: [],
    });

    const attachments = data.attachments || [];
    const remaining = MAX_FILES - attachments.length;

    // CameraCapture is controlled and renders an <img> per file it is given, so
    // it only ever sees the images. The positions are kept alongside so its
    // remove button maps back to the right entry in the combined list.
    const photos = attachments.filter((f) => f.type?.startsWith('image/'));
    const photoPositions = attachments.reduce(
        (acc, f, i) => (f.type?.startsWith('image/') ? [...acc, i] : acc),
        [],
    );

    const addFiles = (files) => {
        // Sliced rather than rejected: taking what fits is kinder than
        // discarding the lot because the last one went over.
        setData('attachments', [...attachments, ...files].slice(0, MAX_FILES));
    };

    const removeFile = (index) => {
        setData('attachments', attachments.filter((_, i) => i !== index));
        // Clearing the picker lets the same file be chosen again after removal;
        // browsers suppress the change event when the value has not moved.
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        // forceFormData so the file uploads are sent as multipart
        post(route('approval-projects.items.store', project.id), { forceFormData: true });
    };

    return (
        <AuthenticatedLayout title="Create Approval Request">
            <Head title="Create Approval Request" />
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Link href={route('approval-projects.items.index', project.id)} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                        <span className="inline-flex items-center gap-1"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>Back</span>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Create Approval Request</h1>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">{project.name}</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 max-w-2xl">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Title *
                            </label>
                            <input
                                type="text"
                                value={data.title}
                                onChange={(e) => setData('title', e.target.value)}
                                className={`w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                                    errors.title ? 'border-red-500' : 'border-gray-300'
                                }`}
                                placeholder="Enter request title"
                                required
                            />
                            {errors.title && <p className="text-red-600 text-sm mt-1">{errors.title}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Description
                            </label>
                            <textarea
                                value={data.description}
                                onChange={(e) => setData('description', e.target.value)}
                                rows="6"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                placeholder="Enter request description"
                            />
                            {errors.description && <p className="text-red-600 text-sm mt-1">{errors.description}</p>}
                        </div>

                        {project.sections?.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Section
                                </label>
                                <select
                                    value={data.approval_section_id}
                                    onChange={(e) => setData('approval_section_id', e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                >
                                    <option value="">— No section —</option>
                                    {project.sections.map((s) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Attachments
                            </label>
                            {/* Source switch. Both write to the same list, so the
                                choice is only about how the next file arrives. */}
                            <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 p-0.5 mb-3" role="group">
                                {[
                                    { id: 'upload', label: 'Upload file' },
                                    { id: 'camera', label: 'Use camera' },
                                ].map(({ id, label }) => (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setSource(id)}
                                        aria-pressed={source === id}
                                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                                            source === id
                                                ? 'bg-blue-600 text-white'
                                                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {source === 'upload' ? (
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    accept={ACCEPTED}
                                    disabled={remaining <= 0}
                                    onChange={(e) => {
                                        addFiles(Array.from(e.target.files));
                                        // Same reason as removeFile: let the picker
                                        // re-offer a file that was added then removed.
                                        e.target.value = '';
                                    }}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-50"
                                />
                            ) : (
                                <CameraCapture
                                    mode="photo"
                                    /* Its own guard stops at the shared cap: the
                                       photos it holds plus whatever slots are
                                       left once uploaded documents are counted. */
                                    maxPhotos={photos.length + Math.max(0, remaining)}
                                    existingFiles={photos}
                                    onCapture={(file) => addFiles([file])}
                                    onRemove={(i) => removeFile(photoPositions[i])}
                                />
                            )}

                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Up to {MAX_FILES} files (PDF, DOC, XLS, ZIP, images) — max 50 MB each.
                                {remaining <= 0 && ' Limit reached — remove one to add another.'}
                            </p>

                            {attachments.length > 0 && (
                                <ul className="mt-2 space-y-1">
                                    {attachments.map((f, i) => (
                                        <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 text-sm text-gray-600 dark:text-gray-400">
                                            <span className="truncate">
                                                {f.name}
                                                <span className="text-gray-400 dark:text-gray-500"> — {(f.size / 1024 / 1024).toFixed(2)} MB</span>
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => removeFile(i)}
                                                aria-label={`Remove ${f.name}`}
                                                className="shrink-0 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                                            >
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {errors.attachments && <p className="text-red-600 text-sm mt-1">{errors.attachments}</p>}
                            {errors['attachments.0'] && <p className="text-red-600 text-sm mt-1">{errors['attachments.0']}</p>}
                        </div>

                        <div className="flex gap-4 pt-4">
                            <Button type="submit" disabled={processing}>
                                {processing ? 'Submitting...' : 'Submit Request'}
                            </Button>
                            <Link href={route('approval-projects.items.index', project.id)}>
                                <Button variant="secondary">Cancel</Button>
                            </Link>
                        </div>
                    </form>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
