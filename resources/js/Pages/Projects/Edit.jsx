import { useForm, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Input from '../../Components/Input';
import Select from '../../Components/Select';
import SearchableSelect from '../../Components/SearchableSelect';
import RichTextEditor from '../../Components/RichTextEditor';
import Button from '../../Components/Button';
import LinkButton from '../../Components/LinkButton';
import UserMultiSelect from '../../Components/UserMultiSelect';
import ProjectRules from '../../Components/ProjectRules';
import TaskSeriesConfig from '../../Components/TaskSeriesConfig';
import ProjectEscalationSettings from '../../Components/ProjectEscalationSettings';
import { flattenFolders } from '../../Components/FolderTree';
import { formatLabel } from '../../utils';

export default function Edit() {
    const { project, users, statuses, memberRoles, folders = [], escalationRecipients = {}, globalEscalation = null } = usePage().props;

    const { data, setData, put, processing, errors } = useForm({
        name: project.name || '',
        description: project.description || '',
        status: project.status || 'active',
        owner_id: project.owner_id || '',
        folder_id: project.folder_id || '',
        due_date: project.due_date ? project.due_date.split('T')[0] : '',
        require_comment_attachment_on_close: project.require_comment_attachment_on_close ?? false,
        hide_completed_tasks: project.hide_completed_tasks ?? false,
        task_series_enabled: project.task_series_enabled ?? false,
        task_series_prefix: project.task_series_prefix || '',
        task_series_padding: project.task_series_padding ?? 4,
        show_task_series_column: project.show_task_series_column ?? true,
        use_global_escalation: project.use_global_escalation ?? true,
        escalation_rules: project.escalation_rules ?? [],
        members: (project.members || []).map((m) => ({ user_id: m.id, role: m.pivot.role })),
    });

    const folderOptions = flattenFolders(folders).map((f) => ({
        value: f.id,
        label: `${' '.repeat(f.level * 3)}${f.name}`,
    }));

    const handleSubmit = (e) => {
        e.preventDefault();
        put(`/projects/${project.id}`);
    };

    return (
        <AuthenticatedLayout title="Edit Project">
            <div className="max-w-2xl">
                <PageHeader
                    title="Edit Project"
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'Projects', href: '/projects' },
                        { label: project.name, href: `/projects/${project.id}` },
                        { label: 'Edit' },
                    ]}
                />

                <Card>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <Input label="Name" id="name" value={data.name} onChange={(e) => setData('name', e.target.value)} error={errors.name} />
                        <RichTextEditor label="Description" id="description" value={data.description} onChange={(val) => setData('description', val)} error={errors.description} placeholder="Add a description..." />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Select
                                label="Status" id="status" value={data.status}
                                onChange={(e) => setData('status', e.target.value)}
                                options={statuses.map((s) => ({ value: s, label: formatLabel(s) }))}
                                error={errors.status}
                            />
                            <SearchableSelect
                                label="Owner" id="owner_id" value={data.owner_id}
                                onChange={(val) => setData('owner_id', val)}
                                placeholder="— Unassigned —"
                                options={users.map((u) => ({ value: u.id, label: u.name }))}
                                error={errors.owner_id}
                                showAvatar
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <SearchableSelect
                                label="Folder" id="folder_id" value={data.folder_id}
                                onChange={(val) => setData('folder_id', val)}
                                placeholder="— Unfiled —"
                                options={folderOptions}
                                error={errors.folder_id}
                            />
                            <Input label="Due Date" id="due_date" type="date" value={data.due_date} onChange={(e) => setData('due_date', e.target.value)} error={errors.due_date} />
                        </div>

                        <ProjectRules
                            requireAttachment={data.require_comment_attachment_on_close}
                            onChange={(val) => setData('require_comment_attachment_on_close', val)}
                            hideCompleted={data.hide_completed_tasks}
                            onHideCompletedChange={(val) => setData('hide_completed_tasks', val)}
                        />

                        <TaskSeriesConfig
                            enabled={data.task_series_enabled}
                            prefix={data.task_series_prefix}
                            padding={data.task_series_padding}
                            onEnabledChange={(val) => setData('task_series_enabled', val)}
                            onPrefixChange={(val) => setData('task_series_prefix', val)}
                            onPaddingChange={(val) => setData('task_series_padding', val)}
                            showColumn={data.show_task_series_column}
                            onShowColumnChange={(val) => setData('show_task_series_column', val)}
                            started={project.task_series_started ?? false}
                            nextSequence={project.task_series_next ?? 1}
                            taskCount={project.unnumbered_task_count ?? 0}
                            errors={errors}
                        />

                        <ProjectEscalationSettings
                            useGlobal={data.use_global_escalation}
                            onUseGlobalChange={(val) => setData('use_global_escalation', val)}
                            rules={data.escalation_rules}
                            onRulesChange={(val) => setData('escalation_rules', val)}
                            recipientOptions={escalationRecipients}
                            globalEscalation={globalEscalation}
                            errors={errors}
                        />

                        <UserMultiSelect
                            label="Members"
                            users={users}
                            selected={data.members}
                            onChange={(members) => setData('members', members)}
                            excludeIds={data.owner_id ? [Number(data.owner_id)] : []}
                            roles={memberRoles}
                            onRoleChange={(userId, role) => {
                                setData('members', data.members.map((m) =>
                                    m.user_id === userId ? { ...m, role } : m
                                ));
                            }}
                        />

                        <div className="flex justify-end gap-3 pt-4">
                            <LinkButton href={`/projects/${project.id}`} variant="secondary">Cancel</LinkButton>
                            <Button type="submit" processing={processing} processingText="Saving...">Save Changes</Button>
                        </div>
                    </form>
                </Card>
            </div>
        </AuthenticatedLayout>
    );
}
