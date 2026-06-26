import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Avatar from './Avatar';

export default function MentionTextarea({ value, onChange, users = [], placeholder = '', rows = 2, className = '' }) {
    const textareaRef = useRef(null);
    const dropdownRef = useRef(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
    const [filter, setFilter] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [mentionStart, setMentionStart] = useState(null);

    const filteredUsers = users.filter((u) =>
        u.name.toLowerCase().includes(filter.toLowerCase())
    ).slice(0, 8);

    const positionDropdown = useCallback(() => {
        if (!textareaRef.current) return;
        const rect = textareaRef.current.getBoundingClientRect();
        setDropdownPosition({
            top: rect.bottom + window.scrollY + 4,
            left: rect.left + window.scrollX,
            width: rect.width,
        });
    }, []);

    const handleInput = (e) => {
        const val = e.target.value;
        onChange(val);

        const cursorPos = e.target.selectionStart;
        const textBeforeCursor = val.slice(0, cursorPos);

        // Find the last @ before cursor that isn't preceded by a word char
        const mentionMatch = textBeforeCursor.match(/(?:^|[\s])@([A-Za-z\s\-\.']*)$/);

        if (mentionMatch) {
            const matchStart = textBeforeCursor.lastIndexOf('@');
            setMentionStart(matchStart);
            setFilter(mentionMatch[1]);
            setSelectedIndex(0);
            setShowDropdown(true);
            positionDropdown();
        } else {
            setShowDropdown(false);
            setMentionStart(null);
        }
    };

    const insertMention = (user) => {
        if (mentionStart === null) return;
        const before = value.slice(0, mentionStart);
        const cursorPos = textareaRef.current?.selectionStart || value.length;
        const after = value.slice(cursorPos);
        const mention = `@${user.name}`;
        const newValue = before + mention + (after.startsWith(' ') ? '' : ' ') + after;
        onChange(newValue);
        setShowDropdown(false);
        setMentionStart(null);

        // Restore focus and cursor position
        requestAnimationFrame(() => {
            if (textareaRef.current) {
                const newPos = before.length + mention.length + (after.startsWith(' ') ? 0 : 1);
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(newPos, newPos);
            }
        });
    };

    const handleKeyDown = (e) => {
        if (!showDropdown || filteredUsers.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex((i) => (i + 1) % filteredUsers.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex((i) => (i - 1 + filteredUsers.length) % filteredUsers.length);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            insertMention(filteredUsers[selectedIndex]);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setShowDropdown(false);
        }
    };

    // Close dropdown on outside click
    useEffect(() => {
        if (!showDropdown) return;
        const handleMouseDown = (e) => {
            if (
                dropdownRef.current && !dropdownRef.current.contains(e.target) &&
                textareaRef.current && !textareaRef.current.contains(e.target)
            ) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [showDropdown]);

    return (
        <div className="relative">
            <textarea
                ref={textareaRef}
                value={value}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                rows={rows}
                className={`w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none ${className}`}
            />
            {showDropdown && filteredUsers.length > 0 && createPortal(
                <div
                    ref={dropdownRef}
                    style={{
                        position: 'absolute',
                        top: dropdownPosition.top,
                        left: dropdownPosition.left,
                        width: dropdownPosition.width,
                        zIndex: 50,
                    }}
                    className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden"
                >
                    <div className="py-1 max-h-48 overflow-y-auto">
                        {filteredUsers.map((user, index) => (
                            <button
                                key={user.id}
                                type="button"
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    insertMention(user);
                                }}
                                onMouseEnter={() => setSelectedIndex(index)}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                                    index === selectedIndex
                                        ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
                            >
                                <Avatar name={user.name} size="sm" />
                                <span className="truncate">{user.name}</span>
                            </button>
                        ))}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
