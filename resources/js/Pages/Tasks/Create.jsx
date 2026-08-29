import { useState } from 'react';
import { pickTaskDate } from '../../taskDates';
import { useForm, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Input from '../../Components/Input';
import Select from '../../Components/Select';
import RichTextEditor from '../../Components/RichTextEditor';
import Button from '../../Components/Button';
import LinkButton from '../../Components/LinkButton';
import UserMultiSelect from '../../Components/UserMultiSelect';
import RecurrenceOptions from '../../Components/RecurrenceOptions';
import EstimateInput from '../../Components/EstimateInput';
import CustomFieldValueEditor from '../../Components/CustomFieldValueEditor';
import { formatLabel } from '../../utils';

export default function Create() {
    const { project, parentTask, sections = [], defaultSectionId, users, statuses, priorities, recurrenceFrequencies, customFields = [] } = usePage().props;

    // Prefill custom fields that have a default value configured
    const defaultCustomFieldValues = () => {
        const values = {};
        customFields.forEach((f) => {
            const dv = f.config?.default_value;
            if (['formula', 'week_of_year'].includes(f.type) || dv === undefined || dv === null || dv === '') return;
            if (f.type === 'multi_select') {
                values[f.id] = (Array.isArray(dv) ? dv : [dv]).map(Number);
            } else {
                values[f.id] = String(dv);
            }
        });
        return values;
    };

    const { data, setData, post, processing, errors } = useForm({
        title: '',
        description: '',
        task_type: 'standard',
        status: 'to_do',
        priority: 'medium',
        start_date: '',
        due_date: '',
        due_time: '',
        estimated_minutes: null,
        collaborator_ids: [],
        parent_id: parentTask?.id || '',
        section_id: defaultSectionId || '',
        is_recurring: false,
        recurrence_frequency: 'weekly',
        recurrence_interval: 1,
        recurrence_config: null,
        custom_field_values: defaultCustomFieldValues(),
    });

    const [showStartDate, setShowStartDate] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        post(`/projects/${project.id}/tasks`);
    };

    return (
        <AuthenticatedLayout title={parentTask ? 'New Subtask' : 'New Task'}>
            <div className="max-w-2xl">
                <PageHeader
                    title={parentTask ? 'New Subtask' : 'New Task'}
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'Projects', href: '/projects' },
                        { label: project.name, href: `/projects/${project.id}` },
                        { label: parentTask ? 'New Subtask' : 'New Task' },
                    ]}
                />

                <Card>
                    {parentTask && (
                        <div className="mb-5 flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2 text-sm text-blue-700 dark:text-blue-300">
                            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                            Subtask of: <span className="font-medium">{parentTask.title}</span>
                        </div>
                    )}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <Input label="Title" id="title" value={data.title} onChange={(e) => setData('title', e.target.value)} error={errors.title} />

                        {/* A meeting task keeps minutes; the tab for them appears on the
                            task once it exists. */}
                        <Select
                            label="Task Type"
                            id="task_type"
                            value={data.task_type}
                            onChange={(e) => setData('task_type', e.target.value)}
                            options={[
                                { value: 'standard', label: 'Standard Task' },
                                { value: 'meeting', label: 'Meeting (keeps minutes)' },
                            ]}
                            error={errors.task_type}
                        />
                        <RichTextEditor label="Description" id="description" value={data.description} onChange={(val) => setData('description', val)} error={errors.description} placeholder="Add a description..." />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Select label="Status" id="status" value={data.status} onChange={(e) => setData('status', e.target.value)} options={statuses.map((s) => ({ value: s, label: formatLabel(s) }))} error={errors.status} />
                            <Select label="Priority" id="priority" value={data.priority} onChange={(e) => setData('priority', e.target.value)} options={priorities.map((p) => ({ value: p, label: formatLabel(p) }))} error={errors.priority} />
                        </div>

                        <div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {showStartDate && (
                                    <Input label="Start Date" id="start_date" type="date" max={data.due_date || undefined} value={data.start_date} onChange={(e) => { const o = pickTaskDate({ start: data.start_date, due: data.due_date }, 'start', e.target.value); setData({ ...data, start_date: o.start, due_date: o.due }); if (o.start) setShowStartDate(true); }} error={errors.start_date} />
                                )}
                                <Input label="Due Date" id="due_date" type="date" min={data.start_date || undefined} value={data.due_date} onChange={(e) => { const o = pickTaskDate({ start: data.start_date, due: data.due_date }, 'due', e.target.value); setData({ ...data, start_date: o.start, due_date: o.due }); if (o.start) setShowStartDate(true); }} error={errors.due_date} />
                                <Input label="Due Time" id="due_time" type="time" value={data.due_time} onChange={(e) => setData('due_time', e.target.value)} error={errors.due_time}  />
                            <EstimateInput
                                value={data.estimated_minutes}
                                onChange={(mins) => setData('estimated_minutes', mins)}
                                error={errors.estimated_minutes}
                                />
                            </div>
                            {!showStartDate && (
                                <button
                                    type="button"
                                    onClick={() => setShowStartDate(true)}
                                    className="mt-1.5 text-xs text-primary-600 dark:text-primary-400 hover:underline"
                                >
                                    + Add start date
                                </button>
                            )}
                            {showStartDate && (
                                <button
                                    type="button"
                                    onClick={() => { setShowStartDate(false); setData('start_date', ''); }}
                                    className="mt-1.5 text-xs text-gray-400 hover:text-red-500 hover:underline"
                                >
                                    Remove start date
                                </button>
                            )}
                            {errors.start_date && !showStartDate && (
                                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.start_date}</p>
                            )}
                        </div>

                        {!parentTask && sections.length > 0 && (
                            <Select label="Section" id="section_id" value={data.section_id} onChange={(e) => setData('section_id', e.target.value || '')} placeholder="— No section —" options={sections.map((s) => ({ value: s.id, label: s.name }))} error={errors.section_id} />
                        )}

                        {!parentTask && (
                            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={data.is_recurring}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setData({ ...data, is_recurring: true });
                                            } else {
                                                setData({ ...data, is_recurring: false, recurrence_frequency: 'weekly', recurrence_interval: 1 });
                                            }
                                        }}
                                        className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                                    />
                                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Recurring task</span>
                                </label>

                                {data.is_recurring && (
                                    <>
                                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <Input
                                                label="Every"
                                                id="recurrence_interval"
                                                type="number"
                                                min={1}
                                                max={365}
                                                value={data.recurrence_interval}
                                                onChange={(e) => setData('recurrence_interval', parseInt(e.target.value) || 1)}
                                                error={errors.recurrence_interval}
                                            />
                                            <Select
                                                label="Frequency"
                                                id="recurrence_frequency"
                                                value={data.recurrence_frequency}
                                                onChange={(e) => setData('recurrence_frequency', e.target.value)}
                                                options={recurrenceFrequencies.map((f) => ({ value: f, label: formatLabel(f) }))}
                                                error={errors.recurrence_frequency}
                                            />
                                        </div>
                                        <RecurrenceOptions
                                            frequency={data.recurrence_frequency}
                                            interval={data.recurrence_interval}
                                            config={data.recurrence_config}
                                            onChange={(cfg) => setData('recurrence_config', cfg)}
                                            dueTime={data.due_time}
                                            onDueTimeChange={(val) => setData('due_time', val)}
                                            errors={errors}
                                        />
                                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                            A new task will be created automatically when this task is marked as done.
                                            {data.due_date && ' Next due date will be calculated from the current due date.'}
                                        </p>
                                    </>
                                )}
                            </div>
                        )}

                        <UserMultiSelect
                            label="Collaborators"
                            users={users}
                            selected={data.collaborator_ids}
                            onChange={(ids) => setData('collaborator_ids', ids)}
                        />

                        {customFields.length > 0 && (
                            <div className="space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Custom Fields</h4>
                                {customFields.filter(f => !['formula', 'week_of_year'].includes(f.type)).map(field => (
                                    <CustomFieldValueEditor
                                        key={field.id}
                                        field={field}
                                        value={data.custom_field_values[field.id]}
                                        onChange={(id, val) => setData('custom_field_values', { ...data.custom_field_values, [id]: val })}
                                    />
                                ))}
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-4">
                            <LinkButton href={`/projects/${project.id}`} variant="secondary">Cancel</LinkButton>
                            <Button type="submit" processing={processing} processingText="Creating...">Create Task</Button>
                        </div>
                    </form>
                </Card>
            </div>
        </AuthenticatedLayout>
    );
}
