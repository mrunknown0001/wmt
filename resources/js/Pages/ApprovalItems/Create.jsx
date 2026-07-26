import { Head, Link, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';

export default function Create({ project }) {
    const { data, setData, post, processing, errors } = useForm({
        title: '',
        description: '',
        approval_section_id: '',
        customFieldValues: {},
        attachments: [],
    });

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
                            <input
                                type="file"
                                multiple
                                accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.jpg,.jpeg,.png"
                                onChange={(e) => setData('attachments', Array.from(e.target.files))}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Up to 5 files (PDF, DOC, XLS, ZIP, images) — max 50 MB each.
                            </p>
                            {data.attachments?.length > 0 && (
                                <ul className="mt-2 space-y-1">
                                    {data.attachments.map((f, i) => (
                                        <li key={i} className="text-sm text-gray-600 dark:text-gray-400">{f.name}</li>
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
