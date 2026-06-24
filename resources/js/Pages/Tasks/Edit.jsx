import { useForm, usePage, router } from '@inertiajs/react';
import { useState } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Input from '../../Components/Input';
import Select from '../../Components/Select';
import Textarea from '../../Components/Textarea';
import Button from '../../Components/Button';
import LinkButton from '../../Components/LinkButton';
import Avatar from '../../Components/Avatar';
import UserMultiSelect from '../../Components/UserMultiSelect';
import { formatLabel, apiFetch } from '../../utils';

function timeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fieldLabel(field) {
    const labels = {
        title: 'title',
        description: 'description',
        status: 'status',
        priority: 'priority',
        assigned_to: 'assignee',
        due_date: 'due date',
    };
    return labels[field] || field;
}

function ActivityItem({ item }) {
    const userName = item.user?.name || 'Someone';

    if (item.description) {
        return (
            <div className="flex gap-3 py-3">
                <div className="shrink-0 mt-0.5">
                    <div className="h-7 w-7 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                        <svg className="h-3.5 w-3.5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </div>
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{userName}</span>{' '}
                        {item.description}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{timeAgo(item.created_at)}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex gap-3 py-3">
            <div className="shrink-0 mt-0.5">
                <div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                    <svg className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                </div>
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{userName}</span>{' '}
                    changed {fieldLabel(item.field)}{' '}
                    {item.old_value && (
                        <>from <span className="font-medium text-gray-900 dark:text-gray-100">{item.old_value}</span>{' '}</>
                    )}
                    {item.new_value ? (
                        <>to <span className="font-medium text-gray-900 dark:text-gray-100">{item.new_value}</span></>
                    ) : (
                        <span className="text-gray-500 italic">unset</span>
                    )}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{timeAgo(item.created_at)}</p>
            </div>
        </div>
    );
}

function CommentItem({ item, currentUserId, projectId, taskId }) {
    const [deleting, setDeleting] = useState(false);

    const handleDelete = () => {
        if (!confirm('Delete this comment?')) return;
        setDeleting(true);
        router.delete(`/projects/${projectId}/tasks/${taskId}/comments/${item.id}`, {
            preserveScroll: true,
            onFinish: () => setDeleting(false),
        });
    };

    return (
        <div className="flex gap-3 py-3">
            <div className="shrink-0 mt-0.5">
                <Avatar name={item.user?.name} size="sm" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {item.user?.name || 'Unknown'}
                    </span>
                    <span className="text-xs text-gray-400">{timeAgo(item.created_at)}</span>
                    {item.user?.id === currentUserId && (
                        <button
                            onClick={handleDelete}
                            disabled={deleting}
                            className="text-xs text-gray-400 hover:text-red-500 transition-colors ml-auto"
                        >
                            Delete
                        </button>
                    )}
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">{item.body}</p>
            </div>
        </div>
    );
}


export default function Edit() {
    const { project, task, timeline: initialTimeline, totalComments, totalActivities, users, statuses, priorities, auth } = usePage().props;

    const { data, setData, put, processing, errors } = useForm({
        title: task.title || '',
        description: task.description || '',
        status: task.status || 'to_do',
        priority: task.priority || 'medium',
        assigned_to: task.assigned_to || '',
        due_date: task.due_date ? task.due_date.split('T')[0] : '',
        collaborator_ids: (task.collaborators || []).map((c) => c.id),
    });

    const [activeTab, setActiveTab] = useState('comments');
    const [commentBody, setCommentBody] = useState('');
    const [posting, setPosting] = useState(false);

    // Separate loaded items by type for offset tracking
    const initialComments = (initialTimeline || []).filter(i => i.type === 'comment');
    const initialActivities = (initialTimeline || []).filter(i => i.type === 'activity');

    const [comments, setComments] = useState(initialComments);
    const [activities, setActivities] = useState(initialActivities);
    const [loadingComments, setLoadingComments] = useState(false);
    const [loadingActivities, setLoadingActivities] = useState(false);

    const hasMoreComments = comments.length < (totalComments || 0);
    const hasMoreActivities = activities.length < (totalActivities || 0);

    const loadMoreComments = async () => {
        setLoadingComments(true);
        try {
            const res = await apiFetch(`/projects/${project.id}/tasks/${task.id}/timeline?type=comment&offset=${comments.length}`);
            const json = await res.json();
            setComments(prev => [...prev, ...json.items]);
        } finally {
            setLoadingComments(false);
        }
    };

    const loadMoreActivities = async () => {
        setLoadingActivities(true);
        try {
            const res = await apiFetch(`/projects/${project.id}/tasks/${task.id}/timeline?type=activity&offset=${activities.length}`);
            const json = await res.json();
            setActivities(prev => [...prev, ...json.items]);
        } finally {
            setLoadingActivities(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        put(`/projects/${project.id}/tasks/${task.id}`);
    };

    const handleComment = (e) => {
        e.preventDefault();
        if (!commentBody.trim()) return;
        setPosting(true);
        router.post(`/projects/${project.id}/tasks/${task.id}/comments`, { body: commentBody }, {
            preserveScroll: true,
            onSuccess: () => setCommentBody(''),
            onFinish: () => setPosting(false),
        });
    };

    return (
        <AuthenticatedLayout title="Edit Task">
            <PageHeader
                title="Edit Task"
                breadcrumbs={[
                    { label: 'Dashboard', href: '/dashboard' },
                    { label: 'Projects', href: '/projects' },
                    { label: project.name, href: `/projects/${project.id}` },
                    { label: 'Edit Task' },
                ]}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Task Form */}
                <div className="lg:col-span-2">
                    <Card>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <Input label="Title" id="title" value={data.title} onChange={(e) => setData('title', e.target.value)} error={errors.title} />
                            <Textarea label="Description" id="description" value={data.description} onChange={(e) => setData('description', e.target.value)} error={errors.description} />

                            <div className="grid grid-cols-2 gap-4">
                                <Select label="Status" id="status" value={data.status} onChange={(e) => setData('status', e.target.value)} options={statuses.map((s) => ({ value: s, label: formatLabel(s) }))} error={errors.status} />
                                <Select label="Priority" id="priority" value={data.priority} onChange={(e) => setData('priority', e.target.value)} options={priorities.map((p) => ({ value: p, label: formatLabel(p) }))} error={errors.priority} />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <Select label="Assigned To" id="assigned_to" value={data.assigned_to} onChange={(e) => setData('assigned_to', e.target.value || '')} placeholder="— Unassigned —" options={users.map((u) => ({ value: u.id, label: u.name }))} error={errors.assigned_to} />
                                <Input label="Due Date" id="due_date" type="date" value={data.due_date} onChange={(e) => setData('due_date', e.target.value)} error={errors.due_date} />
                            </div>

                            <UserMultiSelect
                                label="Collaborators"
                                users={users}
                                selected={data.collaborator_ids}
                                onChange={(ids) => setData('collaborator_ids', ids)}
                                excludeIds={data.assigned_to ? [Number(data.assigned_to)] : []}
                            />

                            <div className="flex justify-end gap-3 pt-4">
                                <LinkButton href={`/projects/${project.id}`} variant="secondary">Cancel</LinkButton>
                                <Button type="submit" processing={processing} processingText="Saving...">Save Changes</Button>
                            </div>
                        </form>
                    </Card>
                </div>

                {/* Activity & Comments */}
                <div className="lg:col-span-1">
                    <Card>
                        {/* Tabs */}
                        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
                            <button
                                onClick={() => setActiveTab('comments')}
                                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                    activeTab === 'comments'
                                        ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                            >
                                Comments {totalComments > 0 && <span className="ml-1 text-xs text-gray-400">({totalComments})</span>}
                            </button>
                            <button
                                onClick={() => setActiveTab('activities')}
                                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                    activeTab === 'activities'
                                        ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                            >
                                Activities {totalActivities > 0 && <span className="ml-1 text-xs text-gray-400">({totalActivities})</span>}
                            </button>
                        </div>

                        {/* Comments Tab */}
                        {activeTab === 'comments' && (
                            <>
                                <form onSubmit={handleComment} className="mb-4">
                                    <textarea
                                        value={commentBody}
                                        onChange={(e) => setCommentBody(e.target.value)}
                                        placeholder="Leave a comment..."
                                        rows={2}
                                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
                                    />
                                    <div className="flex justify-end mt-2">
                                        <Button type="submit" size="sm" processing={posting} processingText="Posting..." disabled={!commentBody.trim()}>
                                            Comment
                                        </Button>
                                    </div>
                                </form>

                                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {comments.length > 0 ? (
                                        [...comments].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((item) => (
                                            <CommentItem
                                                key={`comment-${item.id}`}
                                                item={item}
                                                currentUserId={auth.user?.id}
                                                projectId={project.id}
                                                taskId={task.id}
                                            />
                                        ))
                                    ) : (
                                        <p className="text-sm text-gray-400 py-4 text-center">No comments yet.</p>
                                    )}
                                </div>

                                {hasMoreComments && (
                                    <div className="pt-3 border-t border-gray-100 dark:border-gray-700 mt-1">
                                        <button
                                            onClick={loadMoreComments}
                                            disabled={loadingComments}
                                            className="text-xs text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50"
                                        >
                                            {loadingComments ? 'Loading...' : `Show more comments (${totalComments - comments.length})`}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Activities Tab */}
                        {activeTab === 'activities' && (
                            <>
                                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {activities.length > 0 ? (
                                        [...activities].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((item) => (
                                            <ActivityItem key={`activity-${item.id}`} item={item} />
                                        ))
                                    ) : (
                                        <p className="text-sm text-gray-400 py-4 text-center">No activities yet.</p>
                                    )}
                                </div>

                                {hasMoreActivities && (
                                    <div className="pt-3 border-t border-gray-100 dark:border-gray-700 mt-1">
                                        <button
                                            onClick={loadMoreActivities}
                                            disabled={loadingActivities}
                                            className="text-xs text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50"
                                        >
                                            {loadingActivities ? 'Loading...' : `Show more activities (${totalActivities - activities.length})`}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </Card>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
