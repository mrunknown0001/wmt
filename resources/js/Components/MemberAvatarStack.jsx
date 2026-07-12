import Avatar from './Avatar';

export default function MemberAvatarStack({ owner, members = [], maxVisible = 5, onClick }) {
    const allPeople = [
        ...(owner ? [owner] : []),
        ...members.filter((m) => m.id !== owner?.id),
    ];

    if (allPeople.length === 0) return null;

    const visible = allPeople.slice(0, maxVisible);
    const overflow = allPeople.length - maxVisible;

    return (
        <button
            type="button"
            onClick={onClick}
            className="inline-flex items-center -space-x-1.5 hover:opacity-80 transition-opacity cursor-pointer"
            title="View project members"
        >
            {visible.map((person) => (
                <span key={person.id} className="ring-2 ring-white dark:ring-gray-900 rounded-full">
                    <Avatar name={person.name} size="sm" />
                </span>
            ))}
            {overflow > 0 && (
                <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-gray-200 dark:bg-gray-600 text-[10px] font-medium text-gray-600 dark:text-gray-300 ring-2 ring-white dark:ring-gray-900">
                    +{overflow}
                </span>
            )}
        </button>
    );
}
