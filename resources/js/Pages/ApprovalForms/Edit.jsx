import { Head, Link, useForm, router } from '@inertiajs/react';
import { useState } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';
import FormBuilder from '../../Components/FormBuilder';
import RichTextEditor from '../../Components/RichTextEditor';
import CharacterCounter from '../../Components/CharacterCounter';
import { APPROVAL_FORM_LIMITS } from '../../limits';
import AddSectionModal from '../../Components/AddSectionModal';

export default function Edit({ project, form }) {
    if (!project) {
        return (
            <AuthenticatedLayout title="Edit Form - Error">
                <Head title="Edit Form - Error" />
                <div className="text-center py-12">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Project Not Found</h1>
                    <p className="text-gray-600 dark:text-gray-400">Unable to load the project data.</p>
                </div>
            </AuthenticatedLayout>
        );
    }

    const [localSections, setLocalSections] = useState(
        Array.isArray(project.sections) ? project.sections : []
    );
    // Eloquent serialises the customFields relation as snake_case; without this the
    // list is empty and no custom field can be chosen as a mapping target.
    const customFields = project.custom_fields ?? project.customFields ?? [];
    const [showAddSectionModal, setShowAddSectionModal] = useState(false);

    const { data, setData, put, processing, errors } = useForm({
        name: form.name,
        description: form.description,
        is_active: form.is_active,
        submit_button_text: form.submit_button_text,
        success_message: form.success_message,
        email_mode: form.email_mode || 'any',
        fields: form.fields || [],
        item_defaults: form.item_defaults || {
            status: 'pending',
            section_id: null,
            title_field_ids: [],
        },
    });

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        put(route('approval-projects.forms.update', [project.id, form.id]), {
            onFinish: () => setIsSubmitting(false),
        });
    };

    const handleSectionAdded = (newSection) => {
        setLocalSections([...localSections, newSection]);
    };

    return (
        <AuthenticatedLayout title="Edit Approval Form">
            <Head title="Edit Approval Form" />
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Edit Approval Form</h1>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">{project.name}</p>
                    </div>
                    <Link href={route('approval-projects.forms.index', project.id)}>
                        <Button variant="secondary">Cancel</Button>
                    </Link>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Basic Info */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Form Details</h2>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Form Name *
                            </label>
                            <input
                                type="text"
                                value={data.name}
                                onChange={(e) => setData('name', e.target.value)}
                                maxLength={APPROVAL_FORM_LIMITS.name}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                                required
                            />
                            <CharacterCounter used={(data.name || '').length} limit={APPROVAL_FORM_LIMITS.name} />
                            {errors.name && <p className="text-red-600 text-sm mt-1">{errors.name}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Description
                            </label>
                            <RichTextEditor
                                value={data.description || ''}
                                onChange={(html) => setData('description', html)}
                                placeholder="Describe what this form is for..."
                                minimal
                                limit={APPROVAL_FORM_LIMITS.description}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Submit Button Text
                            </label>
                            <input
                                type="text"
                                value={data.submit_button_text}
                                onChange={(e) => setData('submit_button_text', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                                maxLength={APPROVAL_FORM_LIMITS.submitButtonText}
                            />
                            <CharacterCounter used={(data.submit_button_text || '').length} limit={APPROVAL_FORM_LIMITS.submitButtonText} />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Success Message
                            </label>
                            <textarea
                                value={data.success_message}
                                onChange={(e) => setData('success_message', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                                maxLength={APPROVAL_FORM_LIMITS.successMessage}
                                rows="2"
                            />
                            <CharacterCounter used={(data.success_message || '').length} limit={APPROVAL_FORM_LIMITS.successMessage} />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Email Mode
                            </label>
                            <select
                                value={data.email_mode}
                                onChange={(e) => setData('email_mode', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                            >
                                <option value="any">Accept Any Email</option>
                                <option value="registered">Registered Users Only</option>
                            </select>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                If "Registered Users Only", submissions with unregistered or inactive emails will be rejected.
                            </p>
                        </div>

                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={data.is_active}
                                onChange={(e) => setData('is_active', e.target.checked)}
                                className="rounded"
                            />
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Active</span>
                        </label>
                    </div>

                    {/* Form Builder */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <FormBuilder
                            fields={data.fields}
                            onChange={(fields) => setData('fields', fields)}
                            customFields={customFields}
                            sections={localSections}
                        />
                        {errors.fields && <p className="text-red-600 text-sm mt-2">{errors.fields}</p>}
                    </div>

                    {/* Request Defaults */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Request Defaults</h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            These values will be set when a form is submitted.
                        </p>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Default Status
                            </label>
                            <select
                                value={data.item_defaults.status}
                                onChange={(e) => setData('item_defaults', { ...data.item_defaults, status: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                            >
                                <option value="pending">Pending</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Default Section
                            </label>
                            <div className="flex gap-2">
                                <select
                                    value={data.item_defaults.section_id || ''}
                                    onChange={(e) => setData('item_defaults', { ...data.item_defaults, section_id: e.target.value ? parseInt(e.target.value) : null })}
                                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                                >
                                    <option value="">None</option>
                                    {localSections.map(section => (
                                        <option key={section.id} value={section.id}>{section.name}</option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => setShowAddSectionModal(true)}
                                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition"
                                    title="Add new section"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Form Actions */}
                    <div className="flex gap-4">
                        <Button type="submit" disabled={processing || isSubmitting}>
                            {isSubmitting ? 'Saving...' : 'Save Changes'}
                        </Button>
                        <Link href={route('approval-projects.forms.index', project.id)}>
                            <Button variant="secondary">Cancel</Button>
                        </Link>
                    </div>
                </form>
            </div>

            <AddSectionModal
                isOpen={showAddSectionModal}
                onClose={() => setShowAddSectionModal(false)}
                projectId={project.id}
                onSectionAdded={handleSectionAdded}
            />
        </AuthenticatedLayout>
    );
}
