
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { API_BASE_URL } from './api';

type ChatMessage = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  incomplete?: boolean;
};

type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
};

const STORAGE_KEY = 'circuitspark-chat';
const CHATS_STORAGE_KEY = 'circuitspark-chats';
const ACTIVE_CHAT_KEY = 'circuitspark-active-chat';

// Saved with any reply cut short by a connection problem.
const INCOMPLETE_NOTICE =
  '\n\n---\n\n*⚠️ CircuitSpark was interrupted. This answer may be incomplete.*';

// Old chats may contain the interruption notice inside the saved answer.
// Keep the old messages readable without sending that notice to the AI.
function answerText(message: ChatMessage): string {
  return message.role === 'assistant'
    ? message.content.replace(INCOMPLETE_NOTICE, '').trimEnd()
    : message.content;
}

function answerWasInterrupted(message: ChatMessage): boolean {
  return message.incomplete === true ||
    (message.role === 'assistant' && message.content.includes(INCOMPLETE_NOTICE));
}

const suggestions = [
  'Explain how microcontrollers work',
  'Help me plan a project without hardware',
  'I am confused about Arduino pins',
];

// Load conversations from the original storage system
function loadSavedMessages(): ChatMessage[] {
  try {
    const savedChat = localStorage.getItem(STORAGE_KEY);

    if (!savedChat) return [];

    const parsedChat: unknown = JSON.parse(savedChat);

    if (!Array.isArray(parsedChat)) return [];

    return parsedChat.filter(
      (msg): msg is ChatMessage =>
        msg !== null &&
        typeof msg === 'object' &&
        Number.isSafeInteger(msg.id) &&
        msg.id > 0 &&
        (msg.role === 'user' ||
          msg.role === 'assistant') &&
        typeof msg.content === 'string' &&
        msg.content.trim().length > 0
    );
  } catch {
    return [];
  }
}

// Load saved conversations or migrate the original chat
function loadChatSessions(): ChatSession[] {
  try {
    const savedChats = localStorage.getItem(
      CHATS_STORAGE_KEY
    );

    if (savedChats !== null) {
      const parsedChats: unknown = JSON.parse(savedChats);

      if (!Array.isArray(parsedChats)) return [];

      return parsedChats.filter(
        (chat): chat is ChatSession =>
          chat !== null &&
          typeof chat === 'object' &&
          typeof chat.id === 'string' &&
          typeof chat.title === 'string' &&
          Array.isArray(chat.messages) &&
          typeof chat.createdAt === 'number'
      );
    }

    const oldMessages = loadSavedMessages();

    if (oldMessages.length === 0) return [];

    const firstQuestion = oldMessages.find(
      (msg) => msg.role === 'user'
    );

    const oldConversation: ChatSession = {
      id: crypto.randomUUID(),
      title: firstQuestion
        ? firstQuestion.content.slice(0, 45)
        : 'Previous conversation',
      messages: oldMessages,
      createdAt: Date.now(),
    };

    return [oldConversation];
  } catch (error) {
    console.error(
      'Could not load saved conversations:',
      error
    );

    return [];
  }
}

function Tutor() {
  const [question, setQuestion] = useState('');

  // All saved conversations
  const [chatSessions, setChatSessions] =
    useState<ChatSession[]>(loadChatSessions);

  // Always open to a fresh chat. All previous chats remain in History.
  const [activeChatId, setActiveChatId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);

  const currentRequest = useRef<AbortController | null>(
    null
  );

  const nextId = useRef(
    Math.max(0, ...messages.map((msg) => msg.id)) + 1
  );

  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Track which chat owns the displayed messages
  const messagesChatId = useRef(activeChatId);

  // Save messages to the correct conversation
  useEffect(() => {
    if (
      !activeChatId ||
      messagesChatId.current !== activeChatId
    ) {
      return;
    }

    const messagesToSave = messages
      .filter((msg) => msg.content.trim() || msg.incomplete)
      .slice(-100);

    setChatSessions((previousChats) =>
      previousChats.map((chat) => {
        if (chat.id !== activeChatId) {
          return chat;
        }

        const firstQuestion = messagesToSave.find(
          (msg) => msg.role === 'user'
        );

        return {
          ...chat,
          title:
            chat.title === 'New Chat' && firstQuestion
              ? firstQuestion.content.slice(0, 45)
              : chat.title,
          messages: messagesToSave,
        };
      })
    );
  }, [messages, activeChatId]);

  // Save conversations in browser storage
  useEffect(() => {
    try {
      localStorage.setItem(
        CHATS_STORAGE_KEY,
        JSON.stringify(chatSessions)
      );
    } catch (error) {
      console.error(
        'Could not save CircuitSpark conversations:',
        error
      );
    }
  }, [chatSessions]);

  // Remember the selected conversation
  useEffect(() => {
    try {
      if (activeChatId) {
        localStorage.setItem(
          ACTIVE_CHAT_KEY,
          activeChatId
        );
      } else {
        localStorage.removeItem(ACTIVE_CHAT_KEY);
      }
    } catch (error) {
      console.error(
        'Could not save the selected conversation:',
        error
      );
    }
  }, [activeChatId]);

  // Scroll to the latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [messages, isLoading]);

  // Cancel requests when the component unmounts
  useEffect(() => {
    return () => currentRequest.current?.abort();
  }, []);

  // Create a new conversation
  function startNewChat() {
    if (isLoading) return;

    // Avoid creating multiple empty chats
    if (messages.length === 0) {
      setQuestion('');
      setError('');
      setShowHelp(false);
      setShowHistory(false);
      return;
    }

    const newChat: ChatSession = {
      id: crypto.randomUUID(),
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
    };

    setChatSessions((previousChats) => [
      newChat,
      ...previousChats,
    ]);

    messagesChatId.current = newChat.id;

    setActiveChatId(newChat.id);
    setMessages([]);
    setQuestion('');
    setError('');
    setShowHelp(false);
    setShowHistory(false);
    setEditingMessageId(null);
    setCopiedMessageId(null);

    nextId.current = 1;
  }

  // Open a saved conversation
  function openChat(chatId: string) {
    if (isLoading) return;

    const selectedChat = chatSessions.find(
      (chat) => chat.id === chatId
    );

    if (!selectedChat) return;

    messagesChatId.current = selectedChat.id;

    setActiveChatId(selectedChat.id);
    setMessages([...selectedChat.messages]);

    nextId.current =
      Math.max(
        0,
        ...selectedChat.messages.map((msg) => msg.id)
      ) + 1;

    setQuestion('');
    setError('');
    setShowHelp(false);
    setShowHistory(false);
    setEditingMessageId(null);
    setCopiedMessageId(null);
  }

  // NEW: Rename a conversation
  function renameChat(chatId: string) {
    if (isLoading) return;

    const selectedChat = chatSessions.find(
      (chat) => chat.id === chatId
    );

    if (!selectedChat) return;

    const newTitle = window.prompt(
      'Enter a new name for this conversation:',
      selectedChat.title
    );

    // Cancel means no changes
    if (newTitle === null) return;

    const cleanTitle = newTitle.trim();

    // Don't allow blank conversation titles
    if (!cleanTitle) {
      window.alert('Please enter a conversation name.');
      return;
    }

    // Update only the conversation title
    setChatSessions((previousChats) =>
      previousChats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              title: cleanTitle.slice(0, 80),
            }
          : chat
      )
    );
  }

  // NEW: Delete a conversation with confirmation
  function deleteChat(chatId: string) {
    if (isLoading) return;

    const selectedChat = chatSessions.find(
      (chat) => chat.id === chatId
    );

    if (!selectedChat) return;

    const confirmed = window.confirm(
      `Delete "${selectedChat.title}"?\n\n` +
        'This conversation and its messages will be ' +
        'removed permanently from this browser.'
    );

    // Keep the conversation if deletion was cancelled
    if (!confirmed) return;

    const remainingChats = chatSessions.filter(
      (chat) => chat.id !== chatId
    );

    // Remove the selected conversation
    setChatSessions(remainingChats);

    // If another chat is currently open, leave it alone
    if (activeChatId !== chatId) {
      return;
    }

    // If the active chat was deleted,
    // switch to the next available conversation
    const nextChat = remainingChats[0];

    if (nextChat) {
      messagesChatId.current = nextChat.id;

      setActiveChatId(nextChat.id);
      setMessages([...nextChat.messages]);

      nextId.current =
        Math.max(
          0,
          ...nextChat.messages.map((msg) => msg.id)
        ) + 1;
    } else {
      // No conversations remain: show the welcome screen
      messagesChatId.current = '';

      setActiveChatId('');
      setMessages([]);

      nextId.current = 1;
    }

    setQuestion('');
    setError('');
    setShowHelp(false);
    setEditingMessageId(null);
    setCopiedMessageId(null);
  }

  // The same streaming request is reused for normal replies, Retry, and edits.
  async function generateAnswer(
    prompt: string,
    earlierMessages: ChatMessage[],
    answerId: number
  ) {
    if (currentRequest.current) return;

    const history = earlierMessages
      .filter((msg) => msg.content.trim() && !answerWasInterrupted(msg))
      .slice(-8)
      .map((msg) => ({
        role: msg.role,
        content: answerText(msg),
      }));

    const controller = new AbortController();
    currentRequest.current = controller;
    setIsLoading(true);
    setError('');
    let receivedAnswer = '';

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, history }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error('CircuitSpark could not process your question.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedAnswer += decoder.decode(value, { stream: true });
        const currentText = receivedAnswer;
        setMessages((previous) => previous.map((msg) =>
          msg.id === answerId
            ? { ...msg, content: currentText, incomplete: false }
            : msg
        ));
      }

      receivedAnswer += decoder.decode();
      if (!receivedAnswer.trim()) {
        throw new Error('CircuitSpark finished without generating an answer.');
      }

      setMessages((previous) => previous.map((msg) =>
        msg.id === answerId
          ? { ...msg, content: receivedAnswer, incomplete: false }
          : msg
      ));
    } catch (err) {
      if (controller.signal.aborted) return;

      // Keep partial text (if any), and always provide a Retry button.
      setMessages((previous) => previous.map((msg) =>
        msg.id === answerId
          ? { ...msg, content: receivedAnswer, incomplete: true }
          : msg
      ));

      setError(
        err instanceof TypeError
          ? 'CircuitSpark could not connect. Check the connection, then press Retry on the response.'
          : 'CircuitSpark was interrupted. You can press Retry on the response to try again.'
      );
    } finally {
      if (currentRequest.current === controller) {
        currentRequest.current = null;
        setIsLoading(false);
      }
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = question.trim();
    if (!prompt || isLoading || currentRequest.current || editingMessageId !== null) return;

    if (!activeChatId) {
      const firstChat: ChatSession = {
        id: crypto.randomUUID(),
        title: 'New Chat',
        messages: [],
        createdAt: Date.now(),
      };
      setChatSessions((previous) => [firstChat, ...previous]);
      messagesChatId.current = firstChat.id;
      setActiveChatId(firstChat.id);
    }

    const userId = nextId.current++;
    const answerId = nextId.current++;
    const previousMessages = messages;
    setMessages([
      ...previousMessages,
      { id: userId, role: 'user', content: prompt },
      { id: answerId, role: 'assistant', content: '' },
    ]);
    setQuestion('');
    void generateAnswer(prompt, previousMessages, answerId);
  }

  async function copyMessage(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(answerText(message));
      setCopiedMessageId(message.id);
      window.setTimeout(() => {
        setCopiedMessageId((id) => id === message.id ? null : id);
      }, 1800);
    } catch {
      setError('Copy failed. Please select the text and copy it manually.');
    }
  }

  function beginEditing(message: ChatMessage) {
    if (isLoading || currentRequest.current) return;
    setEditingMessageId(message.id);
    setEditDraft(message.content);
    setError('');
  }

  function saveEditedMessage(messageId: number) {
    if (isLoading || currentRequest.current) return;
    const newPrompt = editDraft.trim();
    if (!newPrompt) return;

    const messageIndex = messages.findIndex((msg) => msg.id === messageId);
    if (messageIndex < 0 || messages[messageIndex].role !== 'user') return;

    if (messageIndex < messages.length - 1 &&
        !window.confirm('Edit this question and replace the replies and messages after it?')) {
      return;
    }

    const previousMessages = messages.slice(0, messageIndex);
    const answerId = nextId.current++;
    setMessages([
      ...previousMessages,
      { id: messageId, role: 'user', content: newPrompt },
      { id: answerId, role: 'assistant', content: '' },
    ]);
    setEditingMessageId(null);
    setEditDraft('');
    void generateAnswer(newPrompt, previousMessages, answerId);
  }

  function regenerateAnswer(messageId: number) {
    if (isLoading || currentRequest.current) return;

    const answerIndex = messages.findIndex((msg) => msg.id === messageId);
    if (answerIndex < 0 || messages[answerIndex].role !== 'assistant') return;

    let userIndex = answerIndex - 1;
    while (userIndex >= 0 && messages[userIndex].role !== 'user') {
      userIndex--;
    }
    if (userIndex < 0) return;

    if (answerIndex < messages.length - 1 &&
        !window.confirm('Regenerate this response and replace all messages after it?')) {
      return;
    }

    const prompt = messages[userIndex].content;
    const earlierMessages = messages.slice(0, userIndex);
    setMessages([
      ...messages.slice(0, userIndex + 1),
      { id: messageId, role: 'assistant', content: '' },
    ]);
    setEditingMessageId(null);
    void generateAnswer(prompt, earlierMessages, messageId);
  }

  return (
    <section
      className="chat-workspace"
      aria-label="CircuitSpark AI chat"
    >
      <div className="chat-inner">
        {/* Workspace header */}
        <div className="chat-topline">
          <span className="chat-live-dot" />

          <span>AI learning workspace</span>

          <span className="chat-topline-note">
            Learn at your own pace
          </span>

          <button
            type="button"
            className="history-toggle-button"
            onClick={() =>
              setShowHistory((previous) => !previous)
            }
            aria-expanded={showHistory}
            aria-controls="chat-history-panel"
            title="View saved conversations"
          >
            <span aria-hidden="true">☷</span>
            History
          </button>

          <button
            type="button"
            className="new-chat-button"
            onClick={startNewChat}
            disabled={isLoading}
            title="Start a new conversation"
          >
            <span aria-hidden="true">＋</span>
            New Chat
          </button>
        </div>

        {/* Saved Chat History */}
        {showHistory && (
          <aside
            id="chat-history-panel"
            className="chat-history-panel"
            aria-label="Saved conversations"
          >
            <div className="history-panel-heading">
              <div>
                <h2>Chat History</h2>
                <p>Pick up where you left off.</p>
              </div>

              <button
                type="button"
                className="history-close-button"
                onClick={() => setShowHistory(false)}
                aria-label="Close Chat History"
              >
                ×
              </button>
            </div>

            {chatSessions.length === 0 ? (
              <p className="history-empty">
                Your conversations will appear here once
                you start chatting.
              </p>
            ) : (
              <div className="history-chat-list">
                {chatSessions.map((chat) => (
                  <div
                    key={chat.id}
                    className="history-chat-row"
                  >
                    {/* Open the conversation */}
                    <button
                      type="button"
                      className={
                        chat.id === activeChatId
                          ? 'history-chat-item active'
                          : 'history-chat-item'
                      }
                      onClick={() => openChat(chat.id)}
                      disabled={isLoading}
                      aria-current={
                        chat.id === activeChatId
                          ? 'true'
                          : undefined
                      }
                    >
                      <span
                        className="history-chat-icon"
                        aria-hidden="true"
                      >
                        ◇
                      </span>

                      <span className="history-chat-details">
                        <span className="history-chat-title">
                          {chat.title}
                        </span>

                        <span className="history-chat-date">
                          {new Date(
                            chat.createdAt
                          ).toLocaleDateString()}
                        </span>
                      </span>
                    </button>

                    {/* NEW: Rename and Delete controls */}
                    <div className="history-chat-actions">
                      <button
                        type="button"
                        className="history-action-button rename"
                        onClick={() => renameChat(chat.id)}
                        disabled={isLoading}
                        aria-label={`Rename ${chat.title}`}
                        title="Rename conversation"
                      >
                        ✎
                      </button>

                      <button
                        type="button"
                        className="history-action-button delete"
                        onClick={() => deleteChat(chat.id)}
                        disabled={isLoading}
                        aria-label={`Delete ${chat.title}`}
                        title="Delete conversation"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}

        {messages.length === 0 ? (
          <div className="chat-empty">
            <button
              type="button"
              className="assistant-emblem chat-emblem"
              onClick={() => setShowHelp(!showHelp)}
              aria-expanded={showHelp}
              aria-label="See what CircuitSpark can help with"
            >
              <span>CS</span>
              <i>✦</i>
            </button>

            <p className="eyebrow chat-eyebrow">
              HELLO, CURIOUS MIND
            </p>

            <h1>What are we exploring today?</h1>

            <p className="chat-description">
              Ask a question, tell me what you'd like
              to build, or share something you're
              stuck on.
            </p>

            {showHelp && (
              <p className="assistant-help">
                I can explain concepts, help you think
                through code, suggest no-hardware
                experiments, and guide projects
                step by step.
              </p>
            )}

            <div
              className="chat-suggestions"
              aria-label="Example questions"
            >
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setQuestion(suggestion)}
                >
                  {suggestion}
                  <span>↗</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div
            className="chat-messages"
            role="log"
            aria-label="Conversation"
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={`chat-message ${message.role}`}
              >
                {message.role === 'assistant' && (
                  <span className="mini-cs" aria-hidden="true">CS</span>
                )}

                <div
                  className="chat-message-stack"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: message.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: 'min(720px, 84%)',
                    width: 'fit-content',
                    minWidth: 0,
                  }}
                >
                <div className="chat-bubble" style={{ maxWidth: '100%', boxSizing: 'border-box' }}>
                  {message.role === 'assistant' && (
                    <span className="message-author">CircuitSpark</span>
                  )}

                  {editingMessageId === message.id ? (
                    <div className="message-edit-form">
                      <label className="visually-hidden" htmlFor={`edit-${message.id}`}>
                        Edit your message
                      </label>
                      <textarea
                        id={`edit-${message.id}`}
                        rows={4}
                        value={editDraft}
                        onChange={(event) => setEditDraft(event.target.value)}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '0.7rem', borderRadius: '0.65rem' }}
                      />
                      <p style={{ fontSize: '0.76rem', margin: '0.4rem 0' }}>
                        Saving replaces the answers and any later messages.
                      </p>
                      <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => setEditingMessageId(null)}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={!editDraft.trim()}
                          onClick={() => saveEditedMessage(message.id)}
                        >
                          Save &amp; resend
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="message-content">
                        {answerText(message) ? (
                          message.role === 'assistant' ? (
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {answerText(message)}
                            </ReactMarkdown>
                          ) : (
                            <p style={{ whiteSpace: 'pre-wrap' }}>{message.content}</p>
                          )
                        ) : (
                          <p>
                            {answerWasInterrupted(message)
                              ? 'CircuitSpark could not finish this response.'
                              : 'Preparing your response...'}
                          </p>
                        )}
                      </div>
                      {answerWasInterrupted(message) && (
                        <p style={{ fontSize: '0.78rem', marginTop: '0.5rem' }} role="status">
                          ⚠️ Response interrupted. Use Retry to request it again.
                        </p>
                      )}
                    </>
                  )}
                </div>

                {editingMessageId !== message.id &&
                  !(isLoading && message.role === 'assistant' && message.id === messages[messages.length - 1]?.id) && (
                        <div
                          className="message-actions"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start', gap: '0.65rem', marginTop: '0.35rem', padding: '0 0.4rem', flexWrap: 'wrap', color: '#567183' }}
                        >
                          <button
                            type="button"
                            onClick={() => void copyMessage(message)}
                            title="Copy message"
                            aria-label="Copy message"
                            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.78rem', padding: '0.2rem 0' }}
                          >
                            {copiedMessageId === message.id ? '✓ Copied' : '⧉ Copy'}
                          </button>
                          {message.role === 'user' ? (
                            <button
                              type="button"
                              onClick={() => beginEditing(message)}
                              disabled={isLoading}
                              title="Edit message"
                              aria-label="Edit message"
                              style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.78rem', padding: '0.2rem 0' }}
                            >
                              ✎ Edit
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => regenerateAnswer(message.id)}
                              disabled={isLoading}
                              title={answerWasInterrupted(message) ? 'Retry interrupted response' : 'Regenerate response'}
                              aria-label={answerWasInterrupted(message) ? 'Retry interrupted response' : 'Regenerate response'}
                              style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.78rem', padding: '0.2rem 0' }}
                            >
                              ↻ {answerWasInterrupted(message) ? 'Retry' : 'Regenerate'}
                            </button>
                          )}
                        </div>
                )}
                </div>
              </div>
            ))}

            <div ref={bottomRef} />
          </div>
        )}

        {/* Chat composer */}
        <div className="chat-composer-area">
          {error && (
            <p className="tutor-error" role="alert">
              {error}
            </p>
          )}

          <form
            className="chat-composer"
            onSubmit={handleSubmit}
          >
            <label
              htmlFor="chat-question"
              className="visually-hidden"
            >
              Your question for CircuitSpark
            </label>

            <textarea
              id="chat-question"
              value={question}
              onChange={(event) =>
                setQuestion(event.target.value)
              }
              placeholder="Ask CircuitSpark anything about embedded systems..."
              rows={2}
              disabled={isLoading}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />

            <div className="composer-footer">
              <span>
                {isLoading
                  ? 'CircuitSpark is responding...'
                  : 'Take your curiosity further ✦'}
              </span>

              <button
                type="submit"
                disabled={!question.trim() || isLoading || editingMessageId !== null}
                aria-label="Send message"
                title="Send message"
              >
                ↑
              </button>
            </div>
          </form>

          <p className="composer-caption">
            CircuitSpark is a learning companion.
            Double-check safety-critical circuit advice.
          </p>
        </div>
      </div>
    </section>
  );
}

export default Tutor;
