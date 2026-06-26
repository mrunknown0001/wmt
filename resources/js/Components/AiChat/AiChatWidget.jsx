import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import AiChatButton from './AiChatButton';
import AiChatPanel from './AiChatPanel';

export default function AiChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [conversationId, setConversationId] = useState(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return createPortal(
        <>
            {!isOpen && (
                <AiChatButton onClick={() => setIsOpen(true)} />
            )}
            {isOpen && (
                <AiChatPanel
                    onClose={() => setIsOpen(false)}
                    conversationId={conversationId}
                    onConversationChange={setConversationId}
                />
            )}
        </>,
        document.body
    );
}
