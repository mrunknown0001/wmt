import { useState, useCallback } from 'react';
import { usePage, router } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Button from '../../Components/Button';
import LinkButton from '../../Components/LinkButton';
import Badge from '../../Components/Badge';
import { ConfirmModal } from '../../Components/Modal';
import { apiFetch } from '../../utils';

export default function FormsIndex() {
    const { project, forms } = usePage().props;
    const [formList, setFormList] = useState(forms);
    const [deleteForm, setDeleteForm] = useState(null);
    const [copied, setCopied] = useState(null);

    const handleToggle = useCallback(async (form) => {
        try {
            const res = await apiFetch(`/projects/${project.id}/forms/${form.id}/toggle`, {
                method: 'PATCH',
            });
            const data = await res.json();
            setFormList(prev => prev.map(f => f.id === form.id ? { ...f, is_active: data.form.is_active } : f));
        } catch (e) {
            console.error('Failed to toggle form', e);
        }
    }, [project.id]);

    const handleDelete = useCallback(() => {
        if (!deleteForm) return;
        router.delete(`/projects/${project.id}/forms/${deleteForm.id}`, {
            onSuccess: () => {
                setFormList(prev => prev.filter(f => f.id !== deleteForm.id));
                setDeleteForm(null);
            },
        });
    }, [deleteForm, project.id]);

    const copyUrl = (form) => {
        navigator.clipboard.writeText(form.public_url);
        setCopied(form.id);
        setTimeout(() => setCopied(null), 2000);
    };

    return (
        <AuthenticatedLayout title={`Forms - ${project.name}`}>
            <PageHeader
                title="Forms"
                breadcrumbs={[
                    { label: 'Projects', href: '/projects' },
                    { label: project.name, href: `/projects/${project.id}` },
                    { label: 'Forms' },
                ]}
                actions={
                    <LinkButton href={`/projects/${project.id}/forms/create`}>
                        + New Form
                    </LinkButton>
                }
            />

            <Card>
                {formList.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            No forms yet. Create a form to collect data from external users.
                        </p>
                        <LinkButton href={`/projects/${project.id}/forms/create`}>
                            Create First Form
                        </LinkButton>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        {formList.map(form => (
                            <div key={form.id} className="flex items-center justify-between py-4 px-2">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                            {form.name}
                                        </h3>
                                        <Badge color={form.is_active ? 'green' : 'gray'}>
                                            {form.is_active ? 'Active' : 'Inactive'}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        {form.fields_count} field{form.fields_count !== 1 ? 's' : ''}
                                        {form.creator && ` · Created by ${form.creator.name}`}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 ml-4">
                                    <button
                                        onClick={() => copyUrl(form)}
                                        className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                        title="Copy public URL"
                                    >
                                        {copied === form.id ? 'Copied!' : 'Copy Link'}
                                    </button>
                                    <button
                                        onClick={() => handleToggle(form)}
                                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                                            form.is_active
                                                ? 'border-yellow-300 text-yellow-600 hover:bg-yellow-50 dark:border-yellow-600 dark:text-yellow-400 dark:hover:bg-yellow-900/20'
                                                : 'border-green-300 text-green-600 hover:bg-green-50 dark:border-green-600 dark:text-green-400 dark:hover:bg-green-900/20'
                                        }`}
                                    >
                                        {form.is_active ? 'Deactivate' : 'Activate'}
                                    </button>
                                    <LinkButton
                                        href={`/projects/${project.id}/forms/${form.id}/edit`}
                                        variant="secondary"
                                        size="sm"
                                    >
                                        Edit
                                    </LinkButton>
                                    <Button
                                        variant="danger"
                                        size="sm"
                                        onClick={() => setDeleteForm(form)}
                                    >
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            <ConfirmModal
                isOpen={!!deleteForm}
                onClose={() => setDeleteForm(null)}
                onConfirm={handleDelete}
                title="Delete Form"
                message={`Are you sure you want to delete "${deleteForm?.name}"? This cannot be undone.`}
            />
        </AuthenticatedLayout>
    );
}
