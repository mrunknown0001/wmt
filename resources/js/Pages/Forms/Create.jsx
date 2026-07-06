import { usePage, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Input from '../../Components/Input';
import Textarea from '../../Components/Textarea';
import Button from '../../Components/Button';
import FormBuilder from '../../Components/FormBuilder';

export default function FormsCreate() {
    const { project, customFields } = usePage().props;

    const { data, setData, post, processing, errors } = useForm({
        name: '',
        description: '',
        is_active: true,
        submit_button_text: 'Submit',
        success_message: 'Thank you! Your response has been recorded.',
        fields: [],
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        post(`/projects/${project.id}/forms`);
    };

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
