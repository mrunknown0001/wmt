import { useState, useEffect, useRef, useCallback } from 'react';
import AiChatHeader from './AiChatHeader';
import AiConversationList from './AiConversationList';
import AiMessageBubble from './AiMessageBubble';
import AiChatInput from './AiChatInput';
import AiFollowUpChips from './AiFollowUpChips';
import AiTypingIndicator from './AiTypingIndicator';
import { apiFetch } from '../../utils';

const MAX_MESSAGES = 10;

export default function AiChatPanel({ onClose, conversationId, onConversationChange }) {
    const [view, setView] = useState(conversationId ? 'chat' : 'list');
    const [conversations, setConversations] = useState([]);
    const [messages, setMessages] = useState([]);
    const [followUpPrompts, setFollowUpPrompts] = useState([]);
    const [messageCount, setMessageCount] = useState(0);
    const [conversationTitle, setConversationTitle] = useState('AI Insights');
    const [isStreaming, setIsStreaming] = useState(false);
    const [loadingList, setLoadingList] = useState(false);
    const [streamingStarted, setStreamingStarted] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, followUpPrompts, scrollToBottom]);

    // Load conversations list
    const loadConversations = useCallback(async () => {
        setLoadingList(true);
        try {
            const res = await apiFetch('/api/ai/conversations');
            const data = await res.json();
            setConversations(data.conversations || []);
        } catch {
            // Silently fail
        }
        setLoadingList(false);
    }, []);

    // Load a specific conversation
    const loadConversation = useCallback(async (id) => {
        try {
            const res = await apiFetch(`/api/ai/conversations/${id}`);
            const data = await res.json();
            const conv = data.conversation;
            setMessages(conv.messages || []);
            setMessageCount(conv.user_message_count || 0);
            setConversationTitle(conv.title || 'AI Insights');
            onConversationChange(id);
            setView('chat');

            // Restore follow-up prompts from last assistant message
            const lastAssistant = [...(conv.messages || [])].reverse().find(m => m.role === 'assistant');
            setFollowUpPrompts(lastAssistant?.follow_up_prompts || []);
        } catch {
            // Silently fail
        }
    }, [onConversationChange]);

    useEffect(() => {
        if (view === 'list') {
            loadConversations();
        }
    }, [view, loadConversations]);

    useEffect(() => {
        if (conversationId) {
            loadConversation(conversationId);
        }
    }, []); // Only on mount

    // Create new conversation
    const handleNewChat = async () => {
        try {
            const res = await apiFetch('/api/ai/conversations', {
                method: 'POST',
            });
            const data = await res.json();
            const conv = data.conversation;
            setMessages([]);
            setMessageCount(0);
            setFollowUpPrompts([]);
            setConversationTitle('New Chat');
            onConversationChange(conv.id);
            setView('chat');
        } catch {
            // Silently fail
        }
    };

    // Delete conversation
    const handleDelete = async (id) => {
        try {
            await apiFetch(`/api/ai/conversations/${id}`, { method: 'DELETE' });
            setConversations(prev => prev.filter(c => c.id !== id));
            if (conversationId === id) {
                onConversationChange(null);
                setMessages([]);
                setMessageCount(0);
                setFollowUpPrompts([]);
            }
        } catch {
            // Silently fail
        }
    };

    // Send message with streaming
    const handleSend = async (content, files = []) => {
        if (isStreaming || !conversationId) return;

        // If no conversation yet, create one first
        let activeId = conversationId;
        if (!activeId) {
            try {
                const res = await apiFetch('/api/ai/conversations', { method: 'POST' });
                const data = await res.json();
                activeId = data.conversation.id;
                onConversationChange(activeId);
            } catch {
                return;
            }
        }

        setIsStreaming(true);
        setStreamingStarted(false);
        setFollowUpPrompts([]);

        // Add user message optimistically (with attachment chips)
        const optimisticAttachments = files.map((f) => ({
            file_name: f.name,
            kind: f.type?.startsWith('image/') ? 'image' : 'file',
        }));
        setMessages(prev => [...prev, { role: 'user', content, attachments: optimisticAttachments }]);

        // Auto-title on first message
        if (messageCount === 0) {
            const t = content || files[0]?.name || 'Attachment';
            setConversationTitle(t.length > 80 ? t.substring(0, 80) + '...' : t);
        }

        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;

            // multipart when files are attached; JSON otherwise.
            const headers = { 'X-CSRF-TOKEN': csrfToken, 'Accept': 'text/event-stream' };
            let body;
            if (files.length > 0) {
                body = new FormData();
                if (content) body.append('content', content);
                files.forEach((f) => body.append('attachments[]', f));
            } else {
                headers['Content-Type'] = 'application/json';
                body = JSON.stringify({ content });
            }

            const response = await fetch(`/api/ai/conversations/${activeId}/messages`, {
                method: 'POST',
                headers,
                body,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: errorData.error || 'Something went wrong. Please try again.',
                }]);
                setIsStreaming(false);
                return;
            }

            // Add empty assistant message for streaming
            setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }]);
            setStreamingStarted(true);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data: ')) continue;

                    try {
                        const data = JSON.parse(trimmed.slice(6));

                        if (data.chunk) {
                            setMessages(prev => {
                                const updated = [...prev];
                                const last = updated[updated.length - 1];
                                updated[updated.length - 1] = {
                                    ...last,
                                    content: last.content + data.chunk,
                                };
                                return updated;
                            });
                        }

                        if (data.done) {
                            setFollowUpPrompts(data.follow_up_prompts || []);
                            setMessages(prev => {
                                const updated = [...prev];
                                const last = updated[updated.length - 1];
                                // Strip follow-up block from displayed content
                                const cleanContent = last.content.replace(
                                    /\|\|\|FOLLOW_UP\|\|\|.*?\|\|\|END_FOLLOW_UP\|\|\|/s,
                                    ''
                                ).trim();
                                updated[updated.length - 1] = {
                                    ...last,
                                    content: cleanContent,
                                    isStreaming: false,
                                    model: data.model,
                                    purpose: data.purpose,
                                };
                                return updated;
                            });
                            setMessageCount(prev => prev + 1);
                        }
                    } catch {
                        // Skip malformed SSE data
                    }
                }
            }
        } catch {
            setMessages(prev => {
                // If we added an empty assistant message, replace it
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant' && !last.content) {
                    updated[updated.length - 1] = {
                        role: 'assistant',
                        content: 'Network error. Please check your connection and try again.',
                    };
                } else {
                    updated.push({
                        role: 'assistant',
                        content: 'Network error. Please check your connection and try again.',
                    });
                }
                return updated;
            });
        }

        setIsStreaming(false);
        setStreamingStarted(false);
    };

    const handleBack = () => {
        setView('list');
    };

    const handleSelectConversation = (id) => {
        loadConversation(id);
    };

    return (
        <div className="fixed bottom-0 right-0 z-50 w-[400px] h-[calc(100vh-2rem)] m-4 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden animate-slide-up max-sm:w-[calc(100vw-2rem)]">
            <AiChatHeader
                title={view === 'chat' ? conversationTitle : 'Conversations'}
                showBack={view === 'chat'}
                onBack={handleBack}
                onNewChat={handleNewChat}
                onClose={onClose}
            />

            {view === 'list' ? (
                <AiConversationList
                    conversations={conversations}
                    onSelect={handleSelectConversation}
                    onDelete={handleDelete}
                    loading={loadingList}
                />
            ) : (
                <>
                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto space-y-3 py-4">
                        {messages.length === 0 && !isStreaming && (
                            <div className="flex flex-col items-center justify-center h-full px-6 text-center">
                                <svg className="h-12 w-12 text-primary-300 dark:text-primary-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                                </svg>
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Ask me anything</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    I can help with workload insights, project status, team performance, and more.
                                </p>
                            </div>
                        )}

                        {messages.map((msg, i) => (
                            <AiMessageBubble key={i} message={msg} />
                        ))}

                        {isStreaming && !streamingStarted && (
                            <AiTypingIndicator />
                        )}

                        {!isStreaming && followUpPrompts.length > 0 && (
                            <AiFollowUpChips
                                prompts={followUpPrompts}
                                onSelect={handleSend}
                                disabled={isStreaming || messageCount >= MAX_MESSAGES}
                            />
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    <AiChatInput
                        onSend={handleSend}
                        disabled={isStreaming}
                        messageCount={messageCount}
                        maxMessages={MAX_MESSAGES}
                    />
                </>
            )}
        </div>
    );
}
