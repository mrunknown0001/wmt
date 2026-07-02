import { usePage, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Input from '../../Components/Input';
import Textarea from '../../Components/Textarea';
import Select from '../../Components/Select';
import SearchableSelect from '../../Components/SearchableSelect';
import Button from '../../Components/Button';
import FormBuilder from '../../Components/FormBuilder';

export default function FormsCreate() {
    const { project, customFields, sections, users } = usePage().props;

    const { data, setData, post, processing, errors } = useForm({
        name: '',
        description: '',
        is_active: true,
        submit_button_text: 'Submit',
        success_message: 'Thank you! Your response has been recorded.',
        task_defaults: {
            status: 'to_do',
            priority: 'medium',
            assigned_to: null,
            section_id: null,
        },
        fields: [],
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        post(`/projects/${project.id}/forms`);
    };

    const statusOptions = [
        { value: 'backlog', label: 'Backlog' },
        { value: 'to_do', label: 'To Do' },
        { value: 'in_progress', label: 'In Progress' },
        { value: 'in_review', label: 'In Review' },
    ];

    const priorityOptions = [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        { value: 'urgent', label: 'Urgent' },
    ];

    return (
        <AuthenticatedLayout title={`Create Form - ${project.name}`}>
            <PageHeader
                title="Create Form"
                breadcrumbs={[
                    { label: 'Projects', href: '/projects' },
                    { label: project.name, href: `/projects/${project.id}` },
                    { label: 'Forms', href: `/projects/${project.id}/forms` },
                    { label: 'Create' },
                ]}
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
                            placeholder="e.g. Bug Report Form"
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
                            value={data.description || ''}
                            onChange={(e) => setData('description', e.target.value)}
                            error={errors.description}
                            placeholder="Shown at the top of the form"
                        />
                    </div>
                    <div className="mt-4">
                        <Textarea
                            label="Success Message"
                            id="success_message"
                            value={data.success_message || ''}
                            onChange={(e) => setData('success_message', e.target.value)}
                            error={errors.success_message}
                            placeholder="Shown after successful submission"
                        />
                    </div>
                </Card>

                {/* Task Defaults */}
                <Card>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Task Defaults</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                        When a form is submitted, a task is created with these default values.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Select
                            label="Status"
                            id="task_status"
                            value={data.task_defaults.status}
                            onChange={(e) => setData('task_defaults', { ...data.task_defaults, status: e.target.value })}
                            options={statusOptions}
                        />
                        <Select
                            label="Priority"
                            id="task_priority"
                            value={data.task_defaults.priority}
                            onChange={(e) => setData('task_defaults', { ...data.task_defaults, priority: e.target.value })}
                            options={priorityOptions}
                        />
                        <SearchableSelect
                            label="Assign To"
                            id="task_assigned_to"
                            value={data.task_defaults.assigned_to || ''}
                            onChange={(val) => setData('task_defaults', { ...data.task_defaults, assigned_to: val || null })}
                            options={users.map(u => ({ value: u.id, label: u.name }))}
                            placeholder="— Unassigned —"
                        />
                        {sections.length > 0 && (
                            <Select
                                label="Section"
                                id="task_section"
                                value={data.task_defaults.section_id || ''}
                                onChange={(e) => setData('task_defaults', { ...data.task_defaults, section_id: e.target.value || null })}
                                options={sections.map(s => ({ value: s.id, label: s.name }))}
                                placeholder="— No section —"
                            />
                        )}
                    </div>
                </Card>

                {/* Form Builder */}
                <Card>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Form Fields</h3>
                    <FormBuilder
                        fields={data.fields}
                        onChange={(fields) => setData('fields', fields)}
                        customFields={customFields}
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
                    <Button type="submit" processing={processing} processingText="Creating...">
                        Create Form
                    </Button>
                </div>
            </form>
        </AuthenticatedLayout>
    );
}
