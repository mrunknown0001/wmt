import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import { useEffect, useCallback, useMemo } from 'react';
import tippy from 'tippy.js';
import MentionList from './MentionList';
import Tooltip from './Tooltip';

function ToolbarButton({ onClick, active, title, children }) {
    return (
            <Tooltip content={title}>
            <button
                type="button"
                onClick={onClick}
                className={`p-1.5 rounded transition-colors ${
                    active
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200'
                }`}
            >
                {children}
            </button>
            </Tooltip>
    );
}

function Toolbar({ editor }) {
    if (!editor) return null;

    const setLink = useCallback(() => {
        const prev = editor.getAttributes('link').href;
        const url = window.prompt('URL', prev || 'https://');
        if (url === null) return;
        if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
        } else {
            editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        }
    }, [editor]);

    return (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 rounded-t-lg">
            <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/></svg>
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/></svg>
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/></svg>
            </ToolbarButton>

            <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

            <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg>
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/></svg>
            </ToolbarButton>

            <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

            <ToolbarButton onClick={setLink} active={editor.isActive('link')} title="Link">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
            </ToolbarButton>
        </div>
    );
}

export default function RichTextEditor({ label, id, value, onChange, error, placeholder, className = '', minimal = false, users = [] }) {
    const suggestion = useMemo(() => ({
        items: ({ query }) => {
            return users
                .filter((u) => u.name.toLowerCase().includes(query.toLowerCase()))
                .slice(0, 8)
                .map((u) => ({ id: u.id, label: u.name }));
        },
        render: () => {
            let component;
            let popup;

            return {
                onStart: (props) => {
                    component = new ReactRenderer(MentionList, {
                        props,
                        editor: props.editor,
                    });

                    if (!props.clientRect) return;

                    popup = tippy('body', {
                        getReferenceClientRect: props.clientRect,
                        appendTo: () => document.body,
                        content: component.element,
                        showOnCreate: true,
                        interactive: true,
                        trigger: 'manual',
                        placement: 'bottom-start',
                    });
                },
                onUpdate: (props) => {
                    component?.updateProps(props);
                    if (props.clientRect && popup?.[0]) {
                        popup[0].setProps({ getReferenceClientRect: props.clientRect });
                    }
                },
                onKeyDown: (props) => {
                    if (props.event.key === 'Escape') {
                        popup?.[0]?.hide();
                        return true;
                    }
                    return component?.ref?.onKeyDown(props) || false;
                },
                onExit: () => {
                    popup?.[0]?.destroy();
                    component?.destroy();
                },
            };
        },
    }), [users]);

    const extensions = useMemo(() => {
        const exts = [
            StarterKit.configure({
                heading: minimal ? false : { levels: [2, 3] },
                codeBlock: false,
                code: false,
                blockquote: false,
                horizontalRule: false,
            }),
            Underline,
            Link.configure({
                openOnClick: false,
                HTMLAttributes: { class: 'text-primary-600 dark:text-primary-400 underline' },
            }),
            Placeholder.configure({
                placeholder: placeholder || '',
            }),
        ];

        if (users.length > 0) {
            exts.push(
                Mention.configure({
                    HTMLAttributes: {
                        class: 'mention',
                    },
                    suggestion,
                    renderHTML({ node }) {
                        return ['span', { class: 'mention', 'data-id': node.attrs.id, 'data-label': node.attrs.label }, `@${node.attrs.label}`];
                    },
                })
            );
        }

        return exts;
    }, [minimal, placeholder, users.length > 0]);

    const editor = useEditor({
        extensions,
        content: value || '',
        onUpdate: ({ editor }) => {
            const html = editor.getHTML();
            onChange(html === '<p></p>' ? '' : html);
        },
        editorProps: {
            attributes: {
                class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[60px] px-3 py-2',
            },
        },
    });

    // Sync external value changes (e.g. form reset)
    useEffect(() => {
        if (editor && value !== undefined) {
            const current = editor.getHTML();
            const normalizedValue = value || '';
            const normalizedCurrent = current === '<p></p>' ? '' : current;
            if (normalizedValue !== normalizedCurrent) {
                editor.commands.setContent(value || '');
            }
        }
    }, [value, editor]);

    return (
        <div className={className}>
            {label && (
                <label htmlFor={id} className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                    {label}
                </label>
            )}
            <div
                className={`rounded-lg border shadow-sm transition-colors overflow-hidden ${
                    error
                        ? 'border-red-300 dark:border-red-500'
                        : 'border-gray-300 dark:border-gray-600 focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:border-primary-500'
                } dark:bg-gray-700`}
            >
                <Toolbar editor={editor} />
                <EditorContent editor={editor} />
            </div>
            {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
    );
}
