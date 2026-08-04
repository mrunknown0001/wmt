import { lazy, Suspense } from 'react';

/**
 * Rich text editor, loaded only when one is actually rendered.
 *
 * TipTap and its extensions come to ~490 KB — larger than the entire
 * application bundle. Imported directly, that chunk came down with every page
 * that *might* show an editor, including the project board: TaskDetailPanel
 * imports it, so opening a project paid for an editor nobody had asked for.
 *
 * Splitting it here rather than at each of the six call sites leaves them all
 * unchanged, and means anything added later gets the same treatment without
 * someone having to remember.
 */
const Editor = lazy(() => import('./RichTextEditorInner'));

/**
 * Holds the editor's shape while the chunk arrives, so the form around it
 * doesn't jump when it lands.
 */
function EditorSkeleton({ label, id }) {
    return (
        <div>
            {label && (
                <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {label}
                </label>
            )}
            <div
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50"
                aria-busy="true"
            >
                <div className="h-10 border-b border-gray-200 dark:border-gray-600" />
                <div className="h-28" />
            </div>
        </div>
    );
}

export default function RichTextEditor(props) {
    return (
        <Suspense fallback={<EditorSkeleton label={props.label} id={props.id} />}>
            <Editor {...props} />
        </Suspense>
    );
}

/**
 * Warm the chunk ahead of time.
 *
 * For a page where an editor is certain to be used — a task form, a note — call
 * this on mount so the download overlaps the rest of the page rather than
 * starting only once the editor renders.
 */
export function preloadRichTextEditor() {
    return import('./RichTextEditorInner');
}
