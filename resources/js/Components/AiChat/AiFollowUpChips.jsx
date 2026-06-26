export default function AiFollowUpChips({ prompts, onSelect, disabled }) {
    if (!prompts?.length) return null;

    return (
        <div className="flex flex-wrap gap-2 mt-2 px-4">
            {prompts.map((prompt, i) => (
                <button
                    key={i}
                    onClick={() => onSelect(prompt)}
                    disabled={disabled}
                    className="text-left text-xs px-3 py-1.5 rounded-full border border-primary-200 dark:border-primary-700 text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors disabled:opacity-50"
                >
                    {prompt}
                </button>
            ))}
        </div>
    );
}
