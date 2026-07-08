import { usePage, useForm } from '@inertiajs/react';
import { useState } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Input from '../../Components/Input';
import Textarea from '../../Components/Textarea';
import Button from '../../Components/Button';
import FormBuilder from '../../Components/FormBuilder';

export default function FormsCreate() {
    const { project, customFields, sections } = usePage().props;
    const [logoPreview, setLogoPreview] = useState(null);
    const [bannerPreview, setBannerPreview] = useState(null);

    const { data, setData, post, processing, errors } = useForm({
        name: '',
        description: '',
        is_active: true,
        submit_button_text: 'Submit',
        success_message: 'Thank you! Your response has been recorded.',
        logo: null,
        logo_position: 'left',
        banner: null,
        task_defaults: {
            section_id: null,
            title_field_ids: [],
        },
        fields: [],
    });

    const handleLogoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setData('logo', file);
            setLogoPreview(URL.createObjectURL(file));
        }
    };

    const handleBannerChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setData('banner', file);
            setBannerPreview(URL.createObjectURL(file));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        post(`/projects/${project.id}/forms`, { forceFormData: true });
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

                {/* Branding */}
                <Card>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Branding (Optional)</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {/* Logo */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Logo</label>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Recommended: 200x200px or smaller. PNG, JPG, SVG, or WebP.</p>
                            {logoPreview && (
                                <div className="mb-2 relative inline-block">
                                    <img src={logoPreview} alt="Logo preview" className="max-h-20 rounded border border-gray-200 dark:border-gray-700" />
                                    <button type="button" onClick={() => { setData('logo', null); setLogoPreview(null); }} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600">×</button>
                                </div>
                            )}
                            <input type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml" onChange={handleLogoChange} className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 dark:file:bg-primary-900/30 dark:file:text-primary-400" />
                            {errors.logo && <p className="text-sm text-red-600 mt-1">{errors.logo}</p>}
                            <div className="mt-3">
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Logo Position</label>
                                <div className="flex gap-2">
                                    {['left', 'center', 'right'].map((pos) => (
                                        <button key={pos} type="button" onClick={() => setData('logo_position', pos)} className={`px-3 py-1 text-xs rounded-lg border transition-colors ${data.logo_position === pos ? 'bg-primary-50 border-primary-300 text-primary-700 dark:bg-primary-900/30 dark:border-primary-600 dark:text-primary-400' : 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                                            {pos.charAt(0).toUpperCase() + pos.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        {/* Banner */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Banner</label>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Recommended: 1200x300px. Displayed full-width above the form. Max 10MB.</p>
                            {bannerPreview && (
                                <div className="mb-2 relative">
                                    <img src={bannerPreview} alt="Banner preview" className="w-full max-h-32 object-cover rounded border border-gray-200 dark:border-gray-700" />
                                    <button type="button" onClick={() => { setData('banner', null); setBannerPreview(null); }} className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600">×</button>
                                </div>
                            )}
                            <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleBannerChange} className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 dark:file:bg-primary-900/30 dark:file:text-primary-400" />
                            {errors.banner && <p className="text-sm text-red-600 mt-1">{errors.banner}</p>}
                        </div>
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
                    <Button type="submit" processing={processing} processingText="Creating...">
                        Create Form
                    </Button>
                </div>
            </form>
        </AuthenticatedLayout>
    );
}
