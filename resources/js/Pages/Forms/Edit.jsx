import { usePage, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Input from '../../Components/Input';
import Textarea from '../../Components/Textarea';
import Button from '../../Components/Button';
import FormBuilder from '../../Components/FormBuilder';
import { useState } from 'react';

export default function FormsEdit() {
    const { project, form: initialForm, customFields, sections } = usePage().props;
    const [copied, setCopied] = useState(false);

    const { data, setData, put, processing, errors } = useForm({
        name: initialForm.name,
        description: initialForm.description || '',
        is_active: initialForm.is_active,
        submit_button_text: initialForm.submit_button_text || 'Submit',
        success_message: initialForm.success_message || '',
        task_defaults: initialForm.task_defaults || {
            section_id: null,
            title_field_ids: [],
        },
        fields: (initialForm.fields || []).map(f => ({
            id: f.id,
            type: f.type,
            label: f.label,
            help_text: f.help_text || '',
            is_required: f.is_required,
            position: f.position,
            config: f.config,
            default_value: f.default_value || null,
            is_visible: f.is_visible !== false,
            conditions: f.conditions || null,
            maps_to: f.maps_to,
            custom_field_id: f.custom_field_id,
        })),
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        put(`/projects/${project.id}/forms/${initialForm.id}`);
    };

    const copyUrl = () => {
        navigator.clipboard.writeText(initialForm.public_url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <AuthenticatedLayout title={`Edit Form - ${project.name}`}>
            <PageHeader
                title="Edit Form"
                breadcrumbs={[
                    { label: 'Projects', href: '/projects' },
                    { label: project.name, href: `/projects/${project.id}` },
                    { label: 'Forms', href: `/projects/${project.id}/forms` },
                    { label: 'Edit' },
                ]}
                actions={
                    <div className="flex items-center gap-2">
                        <button
                            onClick={copyUrl}
                            className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            {copied ? 'Copied!' : 'Copy Public URL'}
                        </button>
                        <a
                            href={initialForm.public_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            Preview
                        </a>
                    </div>
                }
            />

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Form Settings */}
                <Card>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Form Settings</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input
                            label="Form Name"
                            id="name"
                            value={data.name}
                            onChange={(e) => setData('name', e.target.value)}
                            error={errors.name}
                        />
                        <Input
                            label="Submit Button Text"
                            id="submit_button_text"
                            value={data.submit_button_text}
                            onChange={(e) => setData('submit_button_text', e.target.value)}
                            error={errors.submit_button_text}
                        />
                    </div>
                    <div className="mt-4">
                        <Textarea
                            label="Description"
                            id="description"
                            value={data.description}
                            onChange={(e) => setData('description', e.target.value)}
                            error={errors.description}
                        />
                    </div>
                    <div className="mt-4">
                        <Textarea
                            label="Success Message"
                            id="success_message"
                            value={data.success_message}
                            onChange={(e) => setData('success_message', e.target.value)}
                            error={errors.success_message}
                        />
                    </div>
                </Card>

                {/* Form Builder */}
                <Card>
                    <FormBuilder
                        fields={data.fields}
                        onChange={(fields) => setData('fields', fields)}
                        customFields={customFields}
                        sections={sections || []}
                        taskDefaults={data.task_defaults}
                        onTaskDefaultsChange={(td) => setData('task_defaults', td)}
                        errors={errors}
                    />
                </Card>

                {/* Submit */}
                <div className="flex justify-end gap-3">
                    <Button
                        variant="secondary"
                        onClick={() => window.history.back()}
                        type="button"
                    >
                        Cancel
                    </Button>
                    <Button type="submit" processing={processing} processingText="Saving...">
                        Save Changes
                    </Button>
                </div>
            </form>
        </AuthenticatedLayout>
    );
}
