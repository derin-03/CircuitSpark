
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { cpp } from '@codemirror/lang-cpp';
import { python } from '@codemirror/lang-python';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Language = 'arduino' | 'python';
type TutorView = 'welcome' | 'conversation';

type Project = {
  id: string;
  name: string;
  language: Language;
  code: string;
  updatedAt: number;
};

type Workspace = {
  projects: Project[];
  activeProjectId: string | null;
};

type TutorMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  incomplete?: boolean;
};

type TutorChats = Record<string, TutorMessage[]>;

type ExecutionResult = {
  projectId: string;
  codeSnapshot: string;
  success: boolean;
  output: string;
  error: string | null;
  target: string;
};

const PROJECTS_KEY = 'circuitspark-codelab-projects';
const OLD_DRAFTS_KEY = 'circuitspark-codelab-drafts';
const PROJECTS_PANEL_KEY =
  'circuitspark-codelab-projects-panel-open';
const TUTOR_CHATS_KEY =
  'circuitspark-codelab-tutor-chats';

const CHAT_ENDPOINT = 'http://127.0.0.1:3001/api/chat';
const COMPILE_ENDPOINT =
  'http://127.0.0.1:3001/api/compile/arduino';
const PYTHON_ENDPOINT =
  'http://127.0.0.1:3001/api/run/python';

const extensions = {
  arduino: [cpp()],
  python: [python()],
};

const starter: Record<Language, string> = {
  arduino: `void setup() {
  // Your setup code goes here
}

void loop() {
  // Your main code goes here
}`,
  python: `# Write your Python code here

print("Hello, CircuitSpark!")
`,
};

function makeId(): string {
  return typeof crypto !== 'undefined' &&
    'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createProject(
  name: string,
  language: Language,
  code?: string
): Project {
  return {
    id: makeId(),
    name,
    language,
    code: code ?? starter[language],
    updatedAt: Date.now(),
  };
}

function loadWorkspace(): Workspace {
  try {
    const stored = localStorage.getItem(PROJECTS_KEY);

    if (stored !== null) {
      const data: unknown = JSON.parse(stored);

      if (
        data &&
        typeof data === 'object' &&
        'projects' in data
      ) {
        const saved = data as {
          projects?: unknown;
          activeProjectId?: unknown;
        };

        if (Array.isArray(saved.projects)) {
          const projects = saved.projects.filter(
            (item): item is Project => {
              if (!item || typeof item !== 'object') {
                return false;
              }

              const p = item as Partial<Project>;

              return (
                typeof p.id === 'string' &&
                typeof p.name === 'string' &&
                (p.language === 'arduino' ||
                  p.language === 'python') &&
                typeof p.code === 'string' &&
                typeof p.updatedAt === 'number'
              );
            }
          );

          const activeProjectId = projects.some(
            (p) => p.id === saved.activeProjectId
          )
            ? (saved.activeProjectId as string)
            : projects[0]?.id ?? null;

          return { projects, activeProjectId };
        }
      }
    }
  } catch {
    // Use an older draft if possible.
  }

  try {
    const raw = localStorage.getItem(OLD_DRAFTS_KEY);

    if (raw) {
      const drafts: unknown = JSON.parse(raw);

      if (drafts && typeof drafts === 'object') {
        const d = drafts as Record<string, unknown>;
        const projects: Project[] = [];

        if (typeof d.arduino === 'string') {
          projects.push(
            createProject(
              'My Arduino Draft',
              'arduino',
              d.arduino
            )
          );
        }

        if (typeof d.python === 'string') {
          projects.push(
            createProject(
              'My Python Draft',
              'python',
              d.python
            )
          );
        }

        if (projects.length) {
          return {
            projects,
            activeProjectId: projects[0].id,
          };
        }
      }
    }
  } catch {
    // Start fresh if needed.
  }

  const first = createProject(
    'My First Arduino Project',
    'arduino'
  );

  return {
    projects: [first],
    activeProjectId: first.id,
  };
}

function loadTutorChats(): TutorChats {
  try {
    const raw = localStorage.getItem(TUTOR_CHATS_KEY);

    if (!raw) return {};

    const data: unknown = JSON.parse(raw);

    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data)
    ) {
      return {};
    }

    const chats: TutorChats = {};

    for (const [id, value] of Object.entries(data)) {
      if (!Array.isArray(value)) continue;

      chats[id] = value
        .filter((item): item is TutorMessage => {
          if (!item || typeof item !== 'object') {
            return false;
          }

          const m = item as Partial<TutorMessage>;

          return (
            typeof m.id === 'string' &&
            (m.role === 'user' ||
              m.role === 'assistant') &&
            typeof m.content === 'string'
          );
        })
        .slice(-100);
    }

    return chats;
  } catch {
    return {};
  }
}

function removeAnsiColors(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, '');
}

export default function CodeLab() {
  const [workspace, setWorkspace] =
    useState<Workspace>(loadWorkspace);

  const [projectsOpen, setProjectsOpen] = useState(
    () => {
      try {
        return (
          localStorage.getItem(PROJECTS_PANEL_KEY) !==
          'false'
        );
      } catch {
        return true;
      }
    }
  );

  const [tutorOpen, setTutorOpen] = useState(false);
  const [tutorView, setTutorView] =
    useState<TutorView>('welcome');

  const [question, setQuestion] = useState('');
  const [chats, setChats] =
    useState<TutorChats>(loadTutorChats);

  const [loading, setLoading] = useState(false);
  const [tutorError, setTutorError] = useState('');
  const [editingMessageId, setEditingMessageId] =
    useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [copiedMessageId, setCopiedMessageId] =
    useState<string | null>(null);

  const requestRef =
    useRef<AbortController | null>(null);

  const chatScrollRef =
    useRef<HTMLDivElement | null>(null);

  const questionRef =
    useRef<HTMLTextAreaElement | null>(null);

  const [newProjectOpen, setNewProjectOpen] =
    useState(false);

  const [newName, setNewName] = useState('');
  const [newLanguage, setNewLanguage] =
    useState<Language | ''>('');
  const [newError, setNewError] = useState('');

  // Arduino compilation state
  const [compiling, setCompiling] = useState(false);
  const [compilation, setCompilation] =
    useState<ExecutionResult | null>(null);
  const [compileError, setCompileError] = useState('');

  const compileRequestRef =
    useRef<AbortController | null>(null);

  // Python execution state
  const [runningPython, setRunningPython] =
    useState(false);

  const [pythonResult, setPythonResult] =
    useState<ExecutionResult | null>(null);

  const [pythonError, setPythonError] = useState('');

  const pythonRequestRef =
    useRef<AbortController | null>(null);

  const project =
    workspace.projects.find(
      (p) => p.id === workspace.activeProjectId
    ) ?? null;

  const messages = project
    ? chats[project.id] ?? []
    : [];

  const currentCompilation =
    project &&
    compilation?.projectId === project.id &&
    compilation.codeSnapshot === project.code
      ? compilation
      : null;

  const currentPythonResult =
    project &&
    pythonResult?.projectId === project.id &&
    pythonResult.codeSnapshot === project.code
      ? pythonResult
      : null;

  // Save Code Lab projects automatically.
  useEffect(() => {
    try {
      localStorage.setItem(
        PROJECTS_KEY,
        JSON.stringify(workspace)
      );
    } catch {
      // Editing continues without local storage.
    }
  }, [workspace]);

  useEffect(() => {
    try {
      localStorage.setItem(
        PROJECTS_PANEL_KEY,
        String(projectsOpen)
      );
    } catch {
      // Sidebar still works.
    }
  }, [projectsOpen]);

  // Save independent AI conversations.
  useEffect(() => {
    try {
      localStorage.setItem(
        TUTOR_CHATS_KEY,
        JSON.stringify(chats)
      );
    } catch {
      // Conversation remains available this visit.
    }
  }, [chats]);

  // Cancel requests on unmount.
  useEffect(() => {
    return () => {
      requestRef.current?.abort();
      compileRequestRef.current?.abort();
      pythonRequestRef.current?.abort();
    };
  }, []);

  // Keep new AI messages visible.
  useEffect(() => {
    if (
      tutorView === 'conversation' &&
      chatScrollRef.current
    ) {
      chatScrollRef.current.scrollTop =
        chatScrollRef.current.scrollHeight;
    }
  }, [messages, tutorView]);

  function toggleTutor() {
    if (!tutorOpen) {
      setTutorView('welcome');
      setTutorError('');
      setQuestion('');
      setEditingMessageId(null);
      setEditDraft('');
    }

    setTutorOpen(!tutorOpen);
  }

  function chooseHelp(prompt: string) {
    setQuestion(prompt);
    setTutorError('');
    questionRef.current?.focus();
  }

  function stopRequest() {
    requestRef.current?.abort();
    requestRef.current = null;
    setLoading(false);
  }

  // Close and clear Arduino compiler results.
  function resetCompilation() {
    compileRequestRef.current?.abort();
    compileRequestRef.current = null;

    setCompiling(false);
    setCompilation(null);
    setCompileError('');
  }

  // Close and clear Python execution results.
  function resetPythonRun() {
    pythonRequestRef.current?.abort();
    pythonRequestRef.current = null;

    setRunningPython(false);
    setPythonResult(null);
    setPythonError('');
  }

  // Compile Arduino code.
  async function compileArduino() {
    if (
      !project ||
      project.language !== 'arduino' ||
      compiling ||
      compileRequestRef.current
    ) {
      return;
    }

    if (!project.code.trim()) {
      setCompileError(
        'Write some Arduino code before compiling.'
      );
      setCompilation(null);
      return;
    }

    const projectId = project.id;
    const codeSnapshot = project.code;

    const controller = new AbortController();
    compileRequestRef.current = controller;

    setCompiling(true);
    setCompilation(null);
    setCompileError('');

    try {
      const response = await fetch(COMPILE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: codeSnapshot,
        }),
        signal: controller.signal,
      });

      const result: unknown = await response.json();

      if (!result || typeof result !== 'object') {
        throw new Error(
          'CircuitSpark received an invalid compiler response.'
        );
      }

      const data = result as {
        success?: unknown;
        board?: unknown;
        output?: unknown;
        error?: unknown;
      };

      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string' && data.error
            ? data.error
            : 'The compilation request could not be completed.'
        );
      }

      if (
        typeof data.success !== 'boolean' ||
        typeof data.output !== 'string'
      ) {
        throw new Error(
          'CircuitSpark received an invalid compiler response.'
        );
      }

      if (!controller.signal.aborted) {
        setCompilation({
          projectId,
          codeSnapshot,
          success: data.success,
          target:
            typeof data.board === 'string'
              ? data.board
              : 'Arduino Uno',
          output: removeAnsiColors(data.output),
          error:
            typeof data.error === 'string'
              ? data.error
              : null,
        });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setCompileError(
          error instanceof Error &&
            error.message !== 'Failed to fetch'
            ? error.message
            : 'Could not connect to the compiler. Check that the backend is running.'
        );
      }
    } finally {
      if (compileRequestRef.current === controller) {
        compileRequestRef.current = null;
        setCompiling(false);
      }
    }
  }

  // Run Python code.
  async function runPython() {
    if (
      !project ||
      project.language !== 'python' ||
      runningPython ||
      pythonRequestRef.current
    ) {
      return;
    }

    if (!project.code.trim()) {
      setPythonError(
        'Write some Python code before running it.'
      );
      setPythonResult(null);
      return;
    }

    const projectId = project.id;
    const codeSnapshot = project.code;

    const controller = new AbortController();
    pythonRequestRef.current = controller;

    setRunningPython(true);
    setPythonResult(null);
    setPythonError('');

    try {
      const response = await fetch(PYTHON_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: codeSnapshot,
        }),
        signal: controller.signal,
      });

      const result: unknown = await response.json();

      if (!result || typeof result !== 'object') {
        throw new Error(
          'CircuitSpark received an invalid Python response.'
        );
      }

      const data = result as {
        success?: unknown;
        language?: unknown;
        output?: unknown;
        error?: unknown;
      };

      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string' && data.error
            ? data.error
            : 'The Python execution request could not be completed.'
        );
      }

      if (
        typeof data.success !== 'boolean' ||
        typeof data.output !== 'string'
      ) {
        throw new Error(
          'CircuitSpark received an invalid Python response.'
        );
      }

      if (!controller.signal.aborted) {
        setPythonResult({
          projectId,
          codeSnapshot,
          success: data.success,
          target:
            typeof data.language === 'string'
              ? data.language
              : 'Python',
          output: data.output,
          error:
            typeof data.error === 'string'
              ? data.error
              : null,
        });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setPythonError(
          error instanceof Error &&
            error.message !== 'Failed to fetch'
            ? error.message
            : 'Could not connect to the Python runner. Check that the backend is running.'
        );
      }
    } finally {
      if (pythonRequestRef.current === controller) {
        pythonRequestRef.current = null;
        setRunningPython(false);
      }
    }
  }

  function selectProject(id: string) {
    if (workspace.activeProjectId === id) return;

    stopRequest();
    resetCompilation();
    resetPythonRun();

    setTutorView('welcome');
    setQuestion('');
    setTutorError('');
    setEditingMessageId(null);
    setEditDraft('');
    setCopiedMessageId(null);

    setWorkspace((prev) => ({
      ...prev,
      activeProjectId: id,
    }));
  }

  function clearConversation() {
    if (!project || loading || !messages.length) {
      return;
    }

    if (
      !window.confirm(
        `Clear AI Tutor conversation for "${project.name}"?`
      )
    ) {
      return;
    }

    setChats((prev) => ({
      ...prev,
      [project.id]: [],
    }));

    setTutorView('welcome');
    setQuestion('');
    setTutorError('');
    setEditingMessageId(null);
    setEditDraft('');
    setCopiedMessageId(null);
  }

  // Use one streaming flow for new questions, edited questions,
  // and Retry/Regenerate. Older answers are not sent as current context.
  async function requestTutorAnswer(
    prompt: string,
    precedingMessages: TutorMessage[],
    existingUserId?: string,
    existingAnswerId?: string
  ) {
    if (!project || loading || requestRef.current) return;

    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) return;

    if (project.code.length > 10000) {
      setTutorError(
        'This project is too large to send in one request. ' +
          'Selected-code help will be added later.'
      );
      return;
    }

    const context = [
      'Help with my current CircuitSpark Code Lab project.',
      `Project name: ${project.name}`,
      `Programming language: ${
        project.language === 'arduino'
          ? 'Arduino C/C++'
          : 'Python'
      }`,
      'Current code (do not claim you compiled or executed it):',
      '```',
      project.code,
      '```',
      `My question: ${cleanPrompt}`,
    ].join('\n');

    const history = precedingMessages
      .filter((m) => m.content.trim() && !m.incomplete)
      .slice(-6)
      .map((m) => ({
        role: m.role,
        content: m.content.slice(0, 1000),
      }));

    const payload = JSON.stringify({
      message: context,
      history,
    });

    if (new TextEncoder().encode(payload).length > 18000) {
      setTutorError(
        'This code and conversation are too large ' +
          'to send together. Try a smaller project ' +
          'or clear the conversation.'
      );
      return;
    }

    const projectId = project.id;
    const user: TutorMessage = {
      id: existingUserId ?? makeId(),
      role: 'user',
      content: cleanPrompt,
    };
    const answerId = existingAnswerId ?? makeId();
    const answer: TutorMessage = {
      id: answerId,
      role: 'assistant',
      content: '',
    };

    const controller = new AbortController();
    requestRef.current = controller;

    // Editing or regenerating replaces the old answer and the
    // subsequent conversation, rather than duplicating turns.
    setChats((prev) => ({
      ...prev,
      [projectId]: [...precedingMessages, user, answer],
    }));
    setTutorView('conversation');
    setTutorError('');
    setEditingMessageId(null);
    setEditDraft('');
    setCopiedMessageId(null);
    setLoading(true);
    if (!existingUserId) setQuestion('');

    let receivedText = '';

    try {
      const response = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: payload,
        signal: controller.signal,
      });

      if (!response.ok) {
        const result = (await response
          .json()
          .catch(() => null)) as {
          error?: string;
        } | null;

        throw new Error(
          result?.error ||
            'CircuitSpark could not answer right now. Please try again.'
        );
      }

      if (!response.body) {
        throw new Error(
          'No response was received. Please try again.'
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        receivedText += decoder.decode(value, {
          stream: true,
        });
        const current = receivedText;

        setChats((prev) => ({
          ...prev,
          [projectId]: (prev[projectId] ?? []).map((m) =>
            m.id === answerId
              ? { ...m, content: current, incomplete: false }
              : m
          ),
        }));
      }

      receivedText += decoder.decode();
      if (!receivedText.trim()) {
        throw new Error(
          'CircuitSpark finished without an answer. Please try again.'
        );
      }

      setChats((prev) => ({
        ...prev,
        [projectId]: (prev[projectId] ?? []).map((m) =>
          m.id === answerId
            ? { ...m, content: receivedText, incomplete: false }
            : m
        ),
      }));
    } catch (error) {
      // Keep even an empty failed response so Retry is always available.
      // A partial response remains readable in the conversation.
      setChats((prev) => ({
        ...prev,
        [projectId]: (prev[projectId] ?? []).map((m) =>
          m.id === answerId
            ? { ...m, content: receivedText, incomplete: true }
            : m
        ),
      }));

      if (!controller.signal.aborted) {
        setTutorError(
          error instanceof Error &&
            error.message !== 'Failed to fetch'
            ? error.message + ' You can press Retry below the answer.'
            : 'CircuitSpark could not connect to the AI service. Press Retry below the answer.'
        );
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }

  function sendQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingMessageId !== null) return;
    const prompt = question.trim();
    if (!prompt || loading || requestRef.current) return;
    // Don't clear an unsent question if the request is rejected.
    if (!project || project.code.length > 10000) {
      setTutorError('Please select a project with at most 10,000 characters of code.');
      return;
    }
    void requestTutorAnswer(prompt, messages);
  }

  async function copyTutorMessage(message: TutorMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => {
        setCopiedMessageId((current) =>
          current === message.id ? null : current
        );
      }, 1800);
    } catch {
      setTutorError(
        'Copy failed. Select the message text and copy it manually.'
      );
    }
  }

  function beginTutorEdit(message: TutorMessage) {
    if (loading || requestRef.current) return;
    setEditingMessageId(message.id);
    setEditDraft(message.content);
    setTutorError('');
  }

  function saveTutorEdit(messageId: string) {
    if (loading || requestRef.current) return;
    const prompt = editDraft.trim();
    if (!prompt) return;

    const index = messages.findIndex((m) => m.id === messageId);
    if (index < 0 || messages[index].role !== 'user') return;

    if (
      index < messages.length - 1 &&
      !window.confirm(
        'Edit this question and replace its answer and all messages after it?'
      )
    ) {
      return;
    }

    void requestTutorAnswer(
      prompt,
      messages.slice(0, index),
      messageId
    );
  }

  function regenerateTutorAnswer(messageId: string) {
    if (loading || requestRef.current) return;

    const answerIndex = messages.findIndex((m) => m.id === messageId);
    if (
      answerIndex < 0 ||
      messages[answerIndex].role !== 'assistant'
    ) {
      return;
    }

    let userIndex = answerIndex - 1;
    while (userIndex >= 0 && messages[userIndex].role !== 'user') {
      userIndex--;
    }
    if (userIndex < 0) return;

    if (
      answerIndex < messages.length - 1 &&
      !window.confirm(
        'Regenerate this response and replace all messages after it?'
      )
    ) {
      return;
    }

    void requestTutorAnswer(
      messages[userIndex].content,
      messages.slice(0, userIndex),
      messages[userIndex].id,
      messageId
    );
  }

  function openNewForm() {
    setNewName('');
    setNewLanguage('');
    setNewError('');
    setNewProjectOpen(true);
  }

  function createNew(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!newName.trim()) {
      setNewError('Please enter a project name.');
      return;
    }

    if (!newLanguage) {
      setNewError(
        'Please choose Arduino C/C++ or Python.'
      );
      return;
    }

    stopRequest();
    resetCompilation();
    resetPythonRun();

    const added = createProject(
      newName.trim(),
      newLanguage
    );

    setWorkspace((prev) => ({
      projects: [added, ...prev.projects],
      activeProjectId: added.id,
    }));

    setTutorView('welcome');
    setQuestion('');
    setTutorError('');
    setNewProjectOpen(false);
    setProjectsOpen(true);
  }

  function updateProject(
    id: string,
    changes: Partial<
      Pick<Project, 'code' | 'language'>
    >
  ) {
    // Invalidate results when the code changes.
    resetCompilation();
    resetPythonRun();

    setWorkspace((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.id === id
          ? {
              ...p,
              ...changes,
              updatedAt: Date.now(),
            }
          : p
      ),
    }));
  }

  function renameProject(p: Project) {
    const input = window.prompt(
      'Rename project:',
      p.name
    );

    if (input === null) return;

    if (!input.trim()) {
      window.alert('Please enter a project name.');
      return;
    }

    setWorkspace((prev) => ({
      ...prev,
      projects: prev.projects.map((item) =>
        item.id === p.id
          ? {
              ...item,
              name: input.trim(),
              updatedAt: Date.now(),
            }
          : item
      ),
    }));
  }

  function deleteProject(p: Project) {
    if (
      !window.confirm(
        `Delete "${p.name}"? This cannot be undone.`
      )
    ) {
      return;
    }

    if (p.id === workspace.activeProjectId) {
      stopRequest();
      resetCompilation();
      resetPythonRun();

      setTutorView('welcome');
      setQuestion('');
      setTutorError('');
    }

    setChats((prev) => {
      const next = { ...prev };
      delete next[p.id];
      return next;
    });

    setWorkspace((prev) => {
      const projects = prev.projects.filter(
        (item) => item.id !== p.id
      );

      return {
        projects,
        activeProjectId:
          prev.activeProjectId === p.id
            ? projects[0]?.id ?? null
            : prev.activeProjectId,
      };
    });
  }

  return (
    <section
      className="code-lab"
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '36px 24px',
      }}
    >
      {/* CODE LAB HEADER */}
      <header className="cs-lab-top-header">
        <span
          className="assistant-emblem"
          aria-hidden="true"
          style={{
            width: 70,
            height: 70,
            borderRadius: 23,
            margin: 0,
            flexShrink: 0,
          }}
        >
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m8 7-5 5 5 5" />
            <path d="m16 7 5 5-5 5" />
            <path d="m14 4-4 16" />
          </svg>
          <i>✦</i>
        </span>

        <div className="cs-lab-watermark-container">
          <h1>Code Lab</h1>
          <p>
            Write, explore, and understand code for your
            embedded systems projects.
          </p>
        </div>
      </header>

      {/* CODE LAB STYLES */}
      <style>{`
        .code-lab .cs-lab-top-header {
          margin-bottom: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: 0;
        }

        .code-lab .cs-lab-watermark-container {
          position: relative;
          width: 100%;
          min-height: 74px;
          margin-top: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .code-lab .cs-lab-watermark-container h1 {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0;
          color: rgba(25, 103, 142, 0.11);
          font-family: Nunito, sans-serif;
          font-weight: 900;
          font-size: clamp(3.2rem, 8vw, 5rem);
          line-height: 1;
          letter-spacing: -2px;
          white-space: nowrap;
          pointer-events: none;
          user-select: none;
        }

        .code-lab .cs-lab-watermark-container p {
          position: relative;
          z-index: 1;
          margin: 0;
          padding: 8px 0;
          max-width: 780px;
          color: #183447;
          font-size: clamp(0.95rem, 2vw, 1.08rem);
          line-height: 1.5;
        }

        .code-lab .cs-lab-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 12px;
        }

        .code-lab .cs-lab-panel-toggle,
        .code-lab .cs-lab-action {
          cursor: pointer;
          background: white;
          color: #19678e;
          border: 1px solid #cadde9;
          border-radius: 9px;
          font: inherit;
          padding: 9px 12px;
          font-weight: 700;
          font-size: 13px;
        }

        .code-lab .cs-lab-action {
          padding: 5px 8px;
          font-weight: 500;
          font-size: 12px;
        }

        .code-lab button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .code-lab .cs-lab-panel-toggle:hover,
        .code-lab .cs-lab-action:hover {
          background: #e7f2f9;
        }

        .code-lab .cs-lab-primary,
        .code-lab .cs-lab-tutor-button {
          cursor: pointer;
          background: #19678e;
          color: white;
          border: 1px solid #19678e;
          border-radius: 9px;
          padding: 10px 13px;
          font: inherit;
          font-size: 13px;
          font-weight: 700;
        }

        .code-lab .cs-lab-primary:hover,
        .code-lab .cs-lab-tutor-button:hover {
          background: #145574;
        }

        .code-lab .cs-lab-workspace-shell {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 12px;
          align-items: start;
          min-width: 0;
        }

        .code-lab .cs-lab-workspace-shell.has-tutor {
          grid-template-columns:
            minmax(0, 1fr) minmax(280px, 340px);
        }

        .code-lab .cs-lab-layout {
          min-width: 0;
          display: grid;
          grid-template-columns:
            240px minmax(0, 1fr);
          border: 1px solid #d7e5ed;
          border-radius: 16px;
          background: #fff;
          overflow: hidden;
        }

        .code-lab .cs-lab-layout.is-collapsed {
          grid-template-columns: minmax(0, 1fr);
        }

        .code-lab
        .cs-lab-workspace-shell.has-tutor
        .cs-lab-layout:not(.is-collapsed) {
          grid-template-columns:
            190px minmax(0, 1fr);
        }

        .code-lab .cs-lab-projects {
          min-width: 0;
          padding: 18px 14px;
          background: #f4f9fc;
          border-right: 1px solid #d7e5ed;
        }

        .code-lab .cs-lab-project {
          min-width: 0;
          margin-top: 9px;
          padding: 9px;
          border: 1px solid #d8e5ed;
          border-radius: 10px;
          background: white;
        }

        .code-lab .cs-lab-project.active {
          border-color: #238fbd;
          background: #e8f4fa;
        }

        .code-lab .cs-lab-open {
          width: 100%;
          text-align: left;
          border: 0;
          padding: 3px 2px;
          color: #183447;
          background: transparent;
          cursor: pointer;
          overflow-wrap: anywhere;
        }

        .code-lab .cs-lab-open strong {
          display: block;
          font-size: 13px;
        }

        .code-lab .cs-lab-open small {
          display: block;
          color: #617789;
          margin-top: 3px;
        }

        .code-lab .cs-lab-select {
          max-width: 100%;
          border: 1px solid #cbdde8;
          background: white;
          color: #19384a;
          border-radius: 8px;
          padding: 9px 10px;
        }

        .code-lab .cs-lab-main {
          min-width: 0;
        }

        .code-lab .cm-editor {
          background: #f8fbfd;
          color: #183447;
          text-align: left !important;
          direction: ltr;
        }

        .code-lab .cm-scroller {
          font-family: Consolas, Monaco, monospace;
          line-height: 1.7;
          text-align: left !important;
          direction: ltr;
        }

        .code-lab .cm-content {
          padding: 14px 0;
          text-align: left !important;
          direction: ltr;
        }

        .code-lab .cm-line {
          padding-left: 10px;
          padding-right: 10px;
          text-align: left !important;
        }

        .code-lab .cm-gutters {
          background: #eef5f9;
          border-right: 1px solid #d7e5ed;
          color: #617789;
          min-width: 42px;
          text-align: right;
        }

        .code-lab .cm-gutterElement {
          padding-left: 8px;
          padding-right: 8px;
        }

        .code-lab .cm-lineNumbers .cm-gutterElement {
          text-align: right;
        }

        .code-lab .cm-activeLine,
        .code-lab .cm-activeLineGutter {
          background: #e8f3fa;
        }

        .code-lab .cm-focused {
          outline: none;
        }

        .code-lab .cm-cursor {
          border-left-color: #19678e;
        }

        .code-lab .cm-selectionBackground {
          background: #d8eaf6 !important;
        }

        /* COMPILER AND PYTHON RESULTS */
        .code-lab .cs-lab-compile-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          padding: 12px 16px;
          border-top: 1px solid #d7e5ed;
          background: #fff;
        }

        .code-lab .cs-lab-compile-results {
          margin: 0 16px 16px;
          padding: 14px;
          border: 1px solid #d7e5ed;
          border-radius: 10px;
          background: #f8fbfd;
          text-align: left;
          min-width: 0;
        }

        .code-lab .cs-lab-compile-results.is-success {
          border-color: #9fd5bf;
        }

        .code-lab .cs-lab-compile-results.is-failure {
          border-color: #ecc1c1;
        }

        .code-lab .cs-lab-compile-output {
          margin: 10px 0 0;
          padding: 12px;
          border-radius: 8px;
          background: #eef5f9;
          color: #183447;
          font: 12px/1.65 Consolas, Monaco, monospace;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          overflow-x: auto;
          max-height: 270px;
          overflow-y: auto;
          text-align: left;
        }

        /* AI TUTOR */
        .code-lab .cs-lab-tutor-drawer {
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          width: 100%;
          min-width: 0;
          height: min(760px, 85vh);
          min-height: 420px;
          max-height: none;
          padding: 16px;
          border: 1px solid #d7e5ed;
          border-radius: 16px;
          background: white;
          color: #183447;
          text-align: left;
          overflow: hidden;
        }

        .code-lab .cs-lab-tutor-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-shrink: 0;
          margin-bottom: 8px;
        }

        .code-lab .cs-lab-tutor-welcome {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          padding: 6px 2px 10px;
        }

        .code-lab .cs-lab-help-grid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 9px;
          margin: 12px 0;
        }

        .code-lab .cs-lab-help-choice {
          padding: 11px;
          color: #19384a;
          background: #f4f9fc;
          border: 1px solid #d7e5ed;
          border-radius: 10px;
          text-align: left;
          cursor: pointer;
          font: inherit;
          font-size: 13px;
          font-weight: 650;
        }

        .code-lab .cs-lab-help-choice:hover {
          background: #e8f4fa;
          border-color: #238fbd;
        }

        .code-lab .cs-lab-chat-log {
          flex: 1 1 auto;
          min-height: 0;
          max-height: none;
          overflow-y: auto;
          overflow-x: hidden;
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 8px 2px 16px;
          margin: 0;
          border: 0;
        }

        /* Each message's controls sit BELOW its bubble. */
        .code-lab .cs-lab-chat-message {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
          min-width: 0;
          flex-shrink: 0;
        }

        .code-lab .cs-lab-chat-message.user {
          align-items: flex-end;
        }

        .code-lab .cs-lab-chat-message.assistant
        .cs-lab-chat-bubble {
          width: 100%;
        }

        .code-lab .cs-lab-chat-message.user
        .cs-lab-chat-bubble {
          max-width: 94%;
        }

        .code-lab .cs-lab-chat-actions {
          display: flex;
          gap: 9px;
          flex-wrap: wrap;
          padding: 0 3px;
        }

        .code-lab .cs-lab-chat-message.user
        .cs-lab-chat-actions {
          justify-content: flex-end;
        }

        .code-lab .cs-lab-message-action {
          border: none;
          background: transparent;
          color: #617789;
          padding: 4px 3px;
          font: inherit;
          font-size: 12px;
          cursor: pointer;
        }

        .code-lab .cs-lab-message-action:hover {
          color: #19678e;
          text-decoration: underline;
        }

        .code-lab .cs-lab-edit-form {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .code-lab .cs-lab-edit-input {
          box-sizing: border-box;
          width: 100%;
          min-height: 75px;
          padding: 9px;
          border: 1px solid #9abdd0;
          border-radius: 8px;
          background: white;
          color: #183447;
          font: inherit;
          font-size: 13px;
          resize: vertical;
        }

        .code-lab .cs-lab-edit-actions {
          display: flex;
          gap: 6px;
          justify-content: flex-end;
        }

        .code-lab .cs-lab-chat-bubble {
          box-sizing: border-box;
          flex-shrink: 0;
          padding: 11px 12px;
          border-radius: 10px;
          border: 1px solid #e0eaf0;
          background: #f5fafc;
          color: #183447;
          font-size: 13px;
          line-height: 1.6;
          overflow-wrap: anywhere;
        }

        .code-lab .cs-lab-chat-bubble.user {
          background: #e8f4fa;
          border-color: #d0e5f0;
        }

        .code-lab .cs-lab-chat-bubble p {
          margin: 0 0 8px;
        }

        .code-lab .cs-lab-chat-bubble p:last-child {
          margin-bottom: 0;
        }

        .code-lab .cs-lab-chat-bubble pre {
          overflow-x: auto;
          padding: 10px;
          border-radius: 7px;
          background: #e5f0f6;
        }

        .code-lab .cs-lab-chat-bubble code {
          font-family: Consolas, Monaco, monospace;
        }

        .code-lab .cs-lab-chat-bubble
        :not(pre) > code {
          overflow-wrap: anywhere;
        }

        .code-lab .cs-lab-chat-bubble ul,
        .code-lab .cs-lab-chat-bubble ol {
          padding-left: 19px;
        }

        .code-lab .cs-lab-chat-bubble table {
          display: block;
          max-width: 100%;
          overflow-x: auto;
        }

        .code-lab .cs-lab-chat-bubble th,
        .code-lab .cs-lab-chat-bubble td {
          border: 1px solid #d7e5ed;
          padding: 4px;
        }

        .code-lab .cs-lab-chat-composer {
          flex: 0 0 auto;
          background: white;
          border-top: 1px solid #e1edf3;
          padding-top: 10px;
        }

        .code-lab .cs-lab-help-input {
          width: 100%;
          min-height: 64px;
          max-height: 135px;
          resize: vertical;
          box-sizing: border-box;
          padding: 10px 11px;
          border: 1px solid #cbdde8;
          border-radius: 9px;
          font: inherit;
          font-size: 13px;
          background: #f8fbfd;
          color: #183447;
        }

        .code-lab .cs-lab-tutor-error {
          color: #a83232;
          font-size: 12px;
          margin: 8px 0;
        }

        /* NEW PROJECT MODAL */
        .code-lab .cs-lab-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(16, 41, 56, 0.5);
        }

        .code-lab .cs-lab-modal {
          width: min(100%, 440px);
          max-height: 90vh;
          overflow-y: auto;
          box-sizing: border-box;
          padding: 26px;
          border-radius: 16px;
          background: white;
          box-shadow:
            0 20px 60px rgba(16, 41, 56, 0.2);
          text-align: left;
        }

        .code-lab .cs-lab-form-field {
          width: 100%;
          box-sizing: border-box;
          padding: 11px 12px;
          border: 1px solid #cbdde8;
          border-radius: 9px;
          background: #f8fbfd;
          color: #183447;
          font: inherit;
        }

        .code-lab .cs-lab-form-field:focus {
          outline: 2px solid #238fbd;
          outline-offset: 1px;
        }

        @media (max-width: 960px) {
          .code-lab
          .cs-lab-workspace-shell.has-tutor {
            grid-template-columns: minmax(0, 1fr);
          }

          .code-lab
          .cs-lab-workspace-shell.has-tutor
          .cs-lab-layout:not(.is-collapsed) {
            grid-template-columns:
              240px minmax(0, 1fr);
          }
        }

        @media (max-width: 720px) {
          .code-lab .cs-lab-layout,
          .code-lab
          .cs-lab-workspace-shell.has-tutor
          .cs-lab-layout:not(.is-collapsed) {
            grid-template-columns: minmax(0, 1fr);
          }

          .code-lab .cs-lab-projects {
            border-right: 0;
            border-bottom: 1px solid #d7e5ed;
          }
        }

        @media (max-height: 550px) {
          .code-lab .cs-lab-tutor-drawer {
            min-height: 280px;
            height: 85vh;
          }
        }
      `}</style>

      {/* WORKSPACE TOOLBAR */}
      <div className="cs-lab-toolbar">
        <button
          type="button"
          className="cs-lab-panel-toggle"
          onClick={() =>
            setProjectsOpen((p) => !p)
          }
        >
          {projectsOpen
            ? '◧ Hide My Projects'
            : '▤ Show My Projects'}
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: 13,
              color: '#617789',
            }}
          >
            {project
              ? `Editing: ${project.name}`
              : 'No project selected'}
          </span>

          <button
            type="button"
            className="cs-lab-tutor-button"
            onClick={toggleTutor}
            aria-expanded={tutorOpen}
            aria-controls="cs-lab-code-tutor"
          >
            ✦ {tutorOpen
              ? 'Close AI Tutor'
              : 'AI Tutor'}
          </button>
        </div>
      </div>

      {/* CODE LAB WORKSPACE */}
      <div
        className={`cs-lab-workspace-shell${
          tutorOpen ? ' has-tutor' : ''
        }`}
      >
        <div
          className={`cs-lab-layout${
            projectsOpen ? '' : ' is-collapsed'
          }`}
        >
          {/* MY PROJECTS */}
          {projectsOpen && (
            <aside
              className="cs-lab-projects"
              aria-label="My Code Lab projects"
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: 16,
                  }}
                >
                  My Projects
                </h2>

                <button
                  type="button"
                  className="cs-lab-action"
                  onClick={() =>
                    setProjectsOpen(false)
                  }
                  aria-label="Hide My Projects"
                >
                  ✕
                </button>
              </div>

              <button
                type="button"
                className="cs-lab-primary"
                onClick={openNewForm}
                style={{
                  width: '100%',
                  marginTop: 12,
                }}
              >
                + New Project
              </button>

              <div style={{ marginTop: 16 }}>
                {workspace.projects.length === 0 && (
                  <p style={{ fontSize: 13 }}>
                    No projects yet. Create one to get
                    started.
                  </p>
                )}

                {workspace.projects.map((p) => (
                  <div
                    key={p.id}
                    className={`cs-lab-project${
                      p.id === project?.id
                        ? ' active'
                        : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="cs-lab-open"
                      onClick={() =>
                        selectProject(p.id)
                      }
                      aria-current={
                        p.id === project?.id
                          ? 'true'
                          : undefined
                      }
                    >
                      <strong>{p.name}</strong>

                      <small>
                        {p.language === 'arduino'
                          ? 'Arduino C/C++'
                          : 'Python'}
                      </small>
                    </button>

                    <div
                      style={{
                        display: 'flex',
                        gap: 6,
                        marginTop: 7,
                        flexWrap: 'wrap',
                      }}
                    >
                      <button
                        type="button"
                        className="cs-lab-action"
                        onClick={() =>
                          renameProject(p)
                        }
                      >
                        Rename
                      </button>

                      <button
                        type="button"
                        className="cs-lab-action"
                        onClick={() =>
                          deleteProject(p)
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          )}

          {/* CODE EDITOR */}
          <div className="cs-lab-main">
            {project ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 12,
                    padding: '16px 20px',
                    borderBottom:
                      '1px solid #d7e5ed',
                  }}
                >
                  <div>
                    <strong
                      style={{
                        display: 'block',
                        color: '#183447',
                      }}
                    >
                      {project.name}
                    </strong>

                    <small
                      style={{
                        color: '#617789',
                      }}
                    >
                      Code Editor · Saved automatically
                    </small>
                  </div>

                  <label>
                    <span
                      style={{
                        marginRight: 10,
                      }}
                    >
                      Language
                    </span>

                    <select
                      className="cs-lab-select"
                      value={project.language}
                      onChange={(e) =>
                        updateProject(
                          project.id,
                          {
                            language:
                              e.target.value as Language,
                          }
                        )
                      }
                      aria-label="Current project language"
                    >
                      <option value="arduino">
                        Arduino C/C++
                      </option>

                      <option value="python">
                        Python
                      </option>
                    </select>
                  </label>
                </div>

                <div
                  role="group"
                  aria-label="Code Editor"
                  style={{
                    background: '#f8fbfd',
                    textAlign: 'left',
                  }}
                >
                  <CodeMirror
                    key={`${project.id}-${project.language}`}
                    value={project.code}
                    height="420px"
                    theme="light"
                    extensions={
                      extensions[project.language]
                    }
                    onChange={(value) =>
                      updateProject(
                        project.id,
                        { code: value }
                      )
                    }
                    basicSetup={{
                      lineNumbers: true,
                      highlightActiveLine: true,
                      highlightActiveLineGutter: true,
                      foldGutter: true,
                      bracketMatching: true,
                      closeBrackets: true,
                      indentOnInput: true,
                    }}
                    style={{
                      fontSize: 14,
                      textAlign: 'left',
                    }}
                  />
                </div>

                {/* ARDUINO COMPILER */}
                {project.language === 'arduino' && (
                  <>
                    <div className="cs-lab-compile-bar">
                      <span
                        style={{
                          color: '#617789',
                          fontSize: 12,
                        }}
                      >
                        Target board: Arduino Uno · Compilation
                        only, no hardware execution
                      </span>

                      <button
                        type="button"
                        className="cs-lab-primary"
                        onClick={compileArduino}
                        disabled={
                          compiling ||
                          !project.code.trim()
                        }
                      >
                        {compiling
                          ? 'Compiling…'
                          : '⚙ Compile'}
                      </button>
                    </div>

                    {(compiling ||
                      compileError ||
                      currentCompilation) && (
                      <div
                        className={`cs-lab-compile-results${
                          currentCompilation
                            ? currentCompilation.success
                              ? ' is-success'
                              : ' is-failure'
                            : ''
                        }`}
                        role="status"
                        aria-live="polite"
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent:
                              'space-between',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <strong
                            style={{
                              color: '#183447',
                              fontSize: 14,
                            }}
                          >
                            {compiling
                              ? 'Compiling Arduino sketch…'
                              : compileError
                                ? 'Compiler unavailable'
                                : currentCompilation?.success
                                  ? '✓ Compilation successful'
                                  : '✕ Compilation failed'}
                          </strong>

                          {/* WORKING CLOSE BUTTON */}
                          <button
                            type="button"
                            className="cs-lab-action"
                            onClick={resetCompilation}
                            aria-label="Close compiler results"
                            title="Close compiler results"
                          >
                            ✕
                          </button>
                        </div>

                        {compileError && (
                          <p
                            style={{
                              color: '#a83232',
                              margin: '8px 0 0',
                              fontSize: 13,
                            }}
                          >
                            {compileError}
                          </p>
                        )}

                        {!compiling &&
                          currentCompilation && (
                          <>
                            <p
                              style={{
                                fontSize: 12,
                                color: '#617789',
                                margin: '7px 0 0',
                              }}
                            >
                              {currentCompilation.target}
                              {' · '}
                              Compilation does not verify
                              physical circuit behavior.
                            </p>

                            {currentCompilation.error && (
                              <p
                                style={{
                                  color: '#a83232',
                                  fontSize: 13,
                                }}
                              >
                                {currentCompilation.error}
                              </p>
                            )}

                            <pre className="cs-lab-compile-output">
                              {currentCompilation.output ||
                                (currentCompilation.success
                                  ? 'Compilation completed.'
                                  : 'Compilation failed without additional output.')}
                            </pre>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* PYTHON EXECUTION */}
                {project.language === 'python' && (
                  <>
                    <div className="cs-lab-compile-bar">
                      <span
                        style={{
                          color: '#617789',
                          fontSize: 12,
                        }}
                      >
                        Python · Local execution
                      </span>

                      <button
                        type="button"
                        className="cs-lab-primary"
                        onClick={runPython}
                        disabled={
                          runningPython ||
                          !project.code.trim()
                        }
                      >
                        {runningPython
                          ? 'Running…'
                          : '▶ Run Python'}
                      </button>
                    </div>

                    {(runningPython ||
                      pythonError ||
                      currentPythonResult) && (
                      <div
                        className={`cs-lab-compile-results${
                          currentPythonResult
                            ? currentPythonResult.success
                              ? ' is-success'
                              : ' is-failure'
                            : ''
                        }`}
                        role="status"
                        aria-live="polite"
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent:
                              'space-between',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <strong
                            style={{
                              color: '#183447',
                              fontSize: 14,
                            }}
                          >
                            {runningPython
                              ? 'Running Python program…'
                              : pythonError
                                ? 'Python runner unavailable'
                                : currentPythonResult?.success
                                  ? '✓ Execution successful'
                                  : '✕ Execution failed'}
                          </strong>

                          {/* PYTHON CLOSE BUTTON */}
                          <button
                            type="button"
                            className="cs-lab-action"
                            onClick={resetPythonRun}
                            aria-label="Close Python results"
                            title="Close Python results"
                          >
                            ✕
                          </button>
                        </div>

                        {pythonError && (
                          <p
                            style={{
                              color: '#a83232',
                              margin: '8px 0 0',
                              fontSize: 13,
                            }}
                          >
                            {pythonError}
                          </p>
                        )}

                        {!runningPython &&
                          currentPythonResult && (
                          <>
                            <p
                              style={{
                                fontSize: 12,
                                color: '#617789',
                                margin: '7px 0 0',
                              }}
                            >
                              {currentPythonResult.target}
                              {' · '}
                              Execution output
                            </p>

                            {currentPythonResult.error && (
                              <p
                                style={{
                                  color: '#a83232',
                                  fontSize: 13,
                                }}
                              >
                                {currentPythonResult.error}
                              </p>
                            )}

                            <pre className="cs-lab-compile-output">
                              {currentPythonResult.output ||
                                (currentPythonResult.error
                                  ? ''
                                  : 'Program finished without printing output.')}
                            </pre>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <div style={{ padding: 30 }}>
                Select or create a project to start coding.
              </div>
            )}
          </div>
        </div>

        {/* AI TUTOR */}
        {tutorOpen && (
          <aside
            id="cs-lab-code-tutor"
            className="cs-lab-tutor-drawer"
            aria-label="Code Lab AI Tutor"
          >
            <div className="cs-lab-tutor-heading">
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 19,
                    color: '#183447',
                  }}
                >
                  ✦ AI Tutor
                </h2>

                {tutorView === 'conversation' &&
                  project && (
                    <small
                      style={{
                        color: '#617789',
                        display: 'block',
                        marginTop: 3,
                      }}
                    >
                      {project.name}
                    </small>
                  )}
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 6,
                }}
              >
                {tutorView === 'conversation' && (
                  <button
                    type="button"
                    className="cs-lab-action"
                    onClick={clearConversation}
                    disabled={
                      loading ||
                      !messages.length
                    }
                    title="Clear this project's conversation"
                  >
                    Clear
                  </button>
                )}

                <button
                  type="button"
                  className="cs-lab-action"
                  onClick={() =>
                    setTutorOpen(false)
                  }
                  aria-label="Close AI Tutor"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* WELCOME SCREEN */}
            {tutorView === 'welcome' ? (
              <div className="cs-lab-tutor-welcome">
                <p
                  style={{
                    color: '#617789',
                    fontSize: 13,
                  }}
                >
                  Ask about your current code without
                  leaving Code Lab.
                </p>

                <div
                  style={{
                    border: '1px solid #d7e5ed',
                    borderRadius: 10,
                    background: '#f4f9fc',
                    padding: 12,
                  }}
                >
                  <small
                    style={{
                      display: 'block',
                      color: '#617789',
                      fontWeight: 700,
                    }}
                  >
                    CURRENT PROJECT
                  </small>

                  <strong
                    style={{
                      display: 'block',
                      overflowWrap: 'anywhere',
                      marginTop: 5,
                    }}
                  >
                    {project?.name ??
                      'No project selected'}
                  </strong>

                  {project && (
                    <small
                      style={{
                        color: '#617789',
                      }}
                    >
                      {project.language === 'arduino'
                        ? 'Arduino C/C++'
                        : 'Python'}
                    </small>
                  )}
                </div>

                <p
                  style={{
                    fontWeight: 700,
                    margin: '18px 0 6px',
                  }}
                >
                  How can I help?
                </p>

                <div className="cs-lab-help-grid">
                  <button
                    type="button"
                    className="cs-lab-help-choice"
                    disabled={!project || loading}
                    onClick={() =>
                      chooseHelp(
                        'Explain my code in a beginner-friendly way.'
                      )
                    }
                  >
                    📖 Explain My Code
                  </button>

                  <button
                    type="button"
                    className="cs-lab-help-choice"
                    disabled={!project || loading}
                    onClick={() =>
                      chooseHelp(
                        'Suggest improvements to my code and explain why they help.'
                      )
                    }
                  >
                    ✨ Improve My Code
                  </button>

                  <button
                    type="button"
                    className="cs-lab-help-choice"
                    disabled={!project || loading}
                    onClick={() =>
                      chooseHelp(
                        'Help me find the bug in my code without immediately rewriting everything.'
                      )
                    }
                  >
                    🐛 Find a Bug
                  </button>

                  <button
                    type="button"
                    className="cs-lab-help-choice"
                    disabled={!project || loading}
                    onClick={() =>
                      chooseHelp(
                        'Help me understand this error and how to fix it: '
                      )
                    }
                  >
                    ❔ Understand an Error
                  </button>
                </div>

                {messages.length > 0 && (
                  <button
                    type="button"
                    className="cs-lab-action"
                    onClick={() =>
                      setTutorView('conversation')
                    }
                    style={{
                      marginTop: 6,
                      fontSize: 13,
                    }}
                  >
                    View previous conversation ↗
                  </button>
                )}
              </div>
            ) : (
              /* CONVERSATION SCREEN */
              <div
                className="cs-lab-chat-log"
                ref={chatScrollRef}
                role="log"
                aria-label="Project conversation"
                aria-live="polite"
              >
                {messages.map((message) => (
                  <div
                    className={`cs-lab-chat-message ${message.role}`}
                    key={message.id}
                  >
                    <div className={`cs-lab-chat-bubble ${message.role}`}>
                      <strong
                        style={{
                          fontSize: 12,
                          display: 'block',
                          marginBottom: 5,
                        }}
                      >
                        {message.role === 'user' ? 'You' : 'AI Tutor'}
                      </strong>

                      {editingMessageId === message.id ? (
                        <div className="cs-lab-edit-form">
                          <label
                            htmlFor={`cs-lab-edit-${message.id}`}
                            style={{ fontSize: 12 }}
                          >
                            Edit your question
                          </label>
                          <textarea
                            id={`cs-lab-edit-${message.id}`}
                            className="cs-lab-edit-input"
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            maxLength={3000}
                            autoFocus
                          />
                          <div className="cs-lab-edit-actions">
                            <button
                              type="button"
                              className="cs-lab-action"
                              onClick={() => {
                                setEditingMessageId(null);
                                setEditDraft('');
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="cs-lab-primary"
                              disabled={!editDraft.trim() || loading}
                              onClick={() => saveTutorEdit(message.id)}
                            >
                              Save &amp; Send
                            </button>
                          </div>
                        </div>
                      ) : message.role === 'assistant' ? (
                        message.content ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {message.content}
                          </ReactMarkdown>
                        ) : (
                          <span style={{ color: '#617789' }}>
                            {loading && !message.incomplete
                              ? 'CircuitSpark is responding...'
                              : 'No answer received.'}
                          </span>
                        )
                      ) : (
                        <span style={{ whiteSpace: 'pre-wrap' }}>
                          {message.content}
                        </span>
                      )}

                      {message.incomplete && (
                        <p
                          style={{
                            fontSize: 12,
                            color: '#a83232',
                            marginTop: 8,
                          }}
                        >
                          Response interrupted — use Retry below to try again.
                        </p>
                      )}
                    </div>

                    {/* Actions are OUTSIDE the message bubble. */}
                    {editingMessageId !== message.id && (
                      <div className="cs-lab-chat-actions">
                        {Boolean(message.content) && (
                          <button
                            type="button"
                            className="cs-lab-message-action"
                            onClick={() => void copyTutorMessage(message)}
                            title="Copy message"
                            aria-label="Copy message"
                          >
                            {copiedMessageId === message.id
                              ? '✓ Copied'
                              : '⧉ Copy'}
                          </button>
                        )}

                        {message.role === 'user' ? (
                          <button
                            type="button"
                            className="cs-lab-message-action"
                            disabled={loading || editingMessageId !== null}
                            onClick={() => beginTutorEdit(message)}
                            title="Edit question"
                            aria-label="Edit question"
                          >
                            ✎ Edit
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="cs-lab-message-action"
                            disabled={loading || editingMessageId !== null}
                            onClick={() => regenerateTutorAnswer(message.id)}
                            title={
                              message.incomplete
                                ? 'Retry interrupted response'
                                : 'Regenerate response'
                            }
                            aria-label={
                              message.incomplete
                                ? 'Retry interrupted response'
                                : 'Regenerate response'
                            }
                          >
                            ↻ {message.incomplete ? 'Retry' : 'Regenerate'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* CHAT INPUT */}
            <form
              className="cs-lab-chat-composer"
              onSubmit={sendQuestion}
            >
              <label
                htmlFor="cs-lab-help-question"
                style={{
                  display: 'block',
                  fontWeight: 700,
                  fontSize: 13,
                  marginBottom: 6,
                }}
              >
                {tutorView === 'conversation'
                  ? 'Your message'
                  : 'Your question'}
              </label>

              <textarea
                id="cs-lab-help-question"
                ref={questionRef}
                className="cs-lab-help-input"
                value={question}
                onChange={(e) =>
                  setQuestion(e.target.value)
                }
                disabled={!project || loading || editingMessageId !== null}
                maxLength={3000}
                placeholder={
                  tutorView === 'conversation'
                    ? 'Ask a follow-up...'
                    : 'Ask about your project...'
                }
              />

              {tutorError && (
                <p
                  className="cs-lab-tutor-error"
                  role="alert"
                >
                  {tutorError}
                </p>
              )}

              <button
                className="cs-lab-tutor-button"
                type="submit"
                disabled={
                  !project ||
                  !question.trim() ||
                  loading ||
                  editingMessageId !== null
                }
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: 9,
                }}
              >
                {loading
                  ? 'CircuitSpark is responding...'
                  : 'Send to AI Tutor ↗'}
              </button>

              {tutorView === 'welcome' && (
                <small
                  style={{
                    display: 'block',
                    color: '#617789',
                    lineHeight: 1.45,
                    marginTop: 8,
                  }}
                >
                  When you send, your project code is
                  shared with the AI service. AI Tutor
                  never edits it automatically.
                </small>
              )}
            </form>
          </aside>
        )}
      </div>

      {/* AUTOSAVE INFORMATION */}
      <p
        style={{
          fontSize: 13,
          color: '#617789',
          marginTop: 12,
          textAlign: 'center',
        }}
      >
        Projects are saved automatically in this browser.
        Arduino compilation and local Python execution
        are available.
      </p>

      {/* NEW PROJECT FORM */}
      {newProjectOpen && (
        <div className="cs-lab-modal-backdrop">
          <div
            className="cs-lab-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cs-lab-new-project-title"
          >
            <h2
              id="cs-lab-new-project-title"
              style={{
                margin: '0 0 8px',
                fontSize: 20,
              }}
            >
              Create a new project
            </h2>

            <p
              style={{
                color: '#617789',
                margin: '0 0 20px',
                fontSize: 14,
              }}
            >
              Give your project a name and choose its
              programming language.
            </p>

            <form onSubmit={createNew}>
              <label
                htmlFor="cs-lab-project-name"
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                Project name
              </label>

              <input
                id="cs-lab-project-name"
                className="cs-lab-form-field"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setNewError('');
                }}
                maxLength={80}
                autoFocus
                placeholder="e.g. LED Blink"
                style={{
                  marginBottom: 16,
                }}
              />

              <label
                htmlFor="cs-lab-project-language"
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                Programming language
              </label>

              <select
                id="cs-lab-project-language"
                className="cs-lab-form-field"
                value={newLanguage}
                onChange={(e) => {
                  setNewLanguage(
                    e.target.value as Language | ''
                  );
                  setNewError('');
                }}
                style={{
                  marginBottom: 12,
                }}
              >
                <option value="" disabled>
                  Choose a language...
                </option>

                <option value="arduino">
                  Arduino C/C++
                </option>

                <option value="python">
                  Python
                </option>
              </select>

              {newError && (
                <p
                  role="alert"
                  style={{
                    color: '#a83232',
                    fontSize: 13,
                  }}
                >
                  {newError}
                </p>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  className="cs-lab-action"
                  onClick={() =>
                    setNewProjectOpen(false)
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="cs-lab-primary"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
