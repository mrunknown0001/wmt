import { useState } from 'react';
import RichTextEditor from './RichTextEditor';
import RichContent from './RichContent';
import { COMMENT_LIMIT } from '../limits';
import { Link, router } from '@inertiajs/react';
import Button from './Button';

const AttachmentIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7.172a4 4 0 00-5.656 0l-3.536 3.536a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l3.536-3.536a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
);

const EditIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
);

const DeleteIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const Tooltip = ({ content, children }) => (
    <div className="relative group">
        {children}
        <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block bg-gray-900 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
            {content}
        </span>
    </div>
);

/**
 * Whether a comment says anything.
 *
 * The editor hands back HTML, so a box holding nothing but a formatted space
 * is not empty by string length. What counts is whether a reader would see
 * anything — the same question the server's length rule asks.
 */
const hasText = (html) => (html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim()
    .length > 0;

/**
 * `resubmitOnPost` turns the comment box into the requester's way back into the
 * workflow: the comment (and any attachments) is saved first, then the request is
 * resubmitted — so approvers always see the explanation alongside the new attempt.
 */
export default function ApprovalItemComments({ project, item, comments, auth, resubmitOnPost = false }) {
    const [isAdding, setIsAdding] = useState(false);
    const [commentBody, setCommentBody] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [editingCommentId, setEditingCommentId] = useState(null);
    const [editingBody, setEditingBody] = useState('');
    const [deletingCommentId, setDeletingCommentId] = useState(null);

    const handleAddComment = (e) => {
        e.preventDefault();

        const formData = new FormData();
        formData.append('body', commentBody);

        attachments.forEach((file) => {
            formData.append('attachments[]', file);
        });

        router.post(
            route('approval-projects.items.comments.store', [project.id, item.id]),
            formData,
            {
                onStart: () => setIsAdding(true),
                // Only resubmit once the comment has actually saved, so a failed
                // comment can't silently push the request back into the chain.
                onSuccess: () => {
                    if (resubmitOnPost) {
                        router.post(
                            route('approval-projects.items.resubmit', [project.id, item.id]),
                            {},
                            { preserveScroll: true },
                        );
                    }
                },
                onFinish: () => {
                    setIsAdding(false);
                    setCommentBody('');
                    setAttachments([]);
                },
            }
        );
    };

    const handleUpdateComment = (comment) => {
        router.put(
            route('approval-projects.items.comments.update', [project.id, item.id, comment.id]),
            { body: editingBody },
            {
                onFinish: () => {
                    setEditingCommentId(null);
                    setEditingBody('');
                },
            }
        );
    };

    const handleDeleteComment = (comment) => {
        router.delete(
            route('approval-projects.items.comments.destroy', [project.id, item.id, comment.id])
        );
        setDeletingCommentId(null);
    };

    const confirmDelete = (comment) => {
        setDeletingCommentId(comment.id);
    };

    const handleFileSelect = (e) => {
        const selectedFiles = Array.from(e.target.files);
        if (selectedFiles.length + attachments.length > 5) {
            alert('Maximum 5 files allowed');
            return;
        }
        setAttachments([...attachments, ...selectedFiles]);
    };

    const removeAttachment = (index) => {
        setAttachments(attachments.filter((_, i) => i !== index));
    };

    const isImage = (file) => {
        return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.file_type);
    };

    const isVideo = (file) => {
        return ['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/x-matroska'].includes(file.file_type);
    };

    const isSpreadsheet = (file) => {
        return ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'].includes(file.file_type);
    };

    const isPdf = (file) => {
        return file.file_type === 'application/pdf';
    };

    return (
        <div className="space-y-6">
            {/* Comments Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Comments & Activity</h3>

                {/* Add Comment Form */}
                <form onSubmit={handleAddComment} className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="mb-3">
                        <RichTextEditor
                            value={commentBody}
                            onChange={setCommentBody}
                            placeholder="Add a comment..."
                            minimal
                            limit={COMMENT_LIMIT}
                        />
                    </div>

                    {/* Attachments */}
                    {attachments.length > 0 && (
                        <div className="mb-3 space-y-2">
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Attachments ({attachments.length}/5)
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {attachments.map((file, idx) => (
                                    <div key={idx} className="flex items-center gap-2 px-3 py-1 bg-gray-200 dark:bg-gray-600 rounded-full text-sm">
                                        <span className="truncate max-w-xs">{file.name}</span>
                                        <button
                                            type="button"
                                            onClick={() => removeAttachment(idx)}
                                            className="text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded cursor-pointer transition">
                            <AttachmentIcon />
                            Attach Files
                            <input
                                type="file"
                                multiple
                                onChange={handleFileSelect}
                                className="hidden"
                                accept=".pdf,.docx,.jpg,.jpeg,.png,.webp,.gif,.mp4,.mov,.webm,.3gp,.mkv,.xlsx,.xls,.csv"
                            />
                        </label>
                        <button
                            type="submit"
                            disabled={isAdding || (!hasText(commentBody) && attachments.length === 0)}
                            className="ml-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition"
                        >
                            {isAdding
                                ? (resubmitOnPost ? 'Posting & resubmitting...' : 'Posting...')
                                : (resubmitOnPost ? 'Post Comment and Resubmit' : 'Post Comment')}
                        </button>
                    </div>
                </form>

                {/* Comments List */}
                {comments && comments.length > 0 ? (
                    <div className="space-y-4">
                        {comments.map((comment) => (
                            <div key={comment.id} className="border-l-4 border-gray-200 dark:border-gray-700 pl-4 py-2">
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">
                                            {comment.user?.name || 'Automation'}
                                        </p>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                            {new Date(comment.created_at).toLocaleString()}
                                        </p>
                                    </div>
                                    {comment.user_id === auth.user.id && (
                                        <div className="flex gap-2">
                                            <Tooltip content="Edit">
                                                <button
                                                    onClick={() => {
                                                        setEditingCommentId(comment.id);
                                                        setEditingBody(comment.body);
                                                    }}
                                                    className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                                                >
                                                    <EditIcon />
                                                </button>
                                            </Tooltip>
                                            <Tooltip content="Delete">
                                                <button
                                                    onClick={() => confirmDelete(comment)}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                                                >
                                                    <DeleteIcon />
                                                </button>
                                            </Tooltip>
                                        </div>
                                    )}
                                </div>

                                {editingCommentId === comment.id ? (
                                    <div className="space-y-2">
                                        <RichTextEditor
                                            value={editingBody}
                                            onChange={setEditingBody}
                                            minimal
                                            limit={COMMENT_LIMIT}
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleUpdateComment(comment)}
                                                disabled={!hasText(editingBody)}
                                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded transition"
                                            >
                                                Save
                                            </button>
                                            <button
                                                onClick={() => setEditingCommentId(null)}
                                                className="px-3 py-1 bg-gray-400 hover:bg-gray-500 text-white text-sm rounded transition"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <RichContent
                                            className="text-gray-700 dark:text-gray-300 mb-3"
                                            breaks="whitespace-pre-wrap"
                                        >
                                            {comment.body}
                                        </RichContent>

                                        {/* Attachments Display */}
                                        {comment.attachments && comment.attachments.length > 0 && (
                                            <div className="mt-3 space-y-2">
                                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                                    Attachments
                                                </p>
                                                <div className="flex flex-wrap gap-3">
                                                    {comment.attachments.map((attachment) => (
                                                        <div key={attachment.id}>
                                                            {isImage(attachment) ? (
                                                                <a
                                                                    href={attachment.url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="block"
                                                                >
                                                                    <img
                                                                        src={attachment.url}
                                                                        alt={attachment.file_name}
                                                                        className="h-16 w-16 object-cover rounded hover:opacity-75 transition"
                                                                    />
                                                                </a>
                                                            ) : (
                                                                <a
                                                                    href={`/approval-projects/${project.id}/items/${item.id}/comments/${comment.id}/attachments/${attachment.id}/download`}
                                                                    className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                                                                >
                                                                    <AttachmentIcon />
                                                                    <span className="text-sm truncate max-w-xs">
                                                                        {attachment.file_name}
                                                                    </span>
                                                                </a>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-600 dark:text-gray-400">No comments yet. Be the first to comment!</p>
                )}

                {/* Delete Confirmation Modal */}
                {deletingCommentId && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-sm mx-4">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                Delete Comment
                            </h3>
                            <p className="text-gray-600 dark:text-gray-400 mb-6">
                                Are you sure you want to delete this comment? This action cannot be undone.
                            </p>
                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setDeletingCommentId(null)}
                                    className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-900 font-medium rounded-lg transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleDeleteComment({ id: deletingCommentId })}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
