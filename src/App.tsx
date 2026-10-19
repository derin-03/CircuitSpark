
import { useEffect, useState } from 'react';
import Tutor from './Tutor';
import CodeLab from './CodeLab';
import './App.css';

// Remember whether the learner was in the AI workspace
// before refreshing the current browser tab.
const WORKSPACE_KEY = 'circuitspark-workspace-open';
const ACTIVE_WORKSPACE_KEY = 'circuitspark-active-workspace';

// Restore the workspace only after a refresh.
// A new visit should still display the landing page.
function shouldRestoreWorkspace(): boolean {
  try {
    const navigation = performance.getEntriesByType(
      'navigation'
    )[0] as PerformanceNavigationTiming | undefined;

    return (
      navigation?.type === 'reload' &&
      sessionStorage.getItem(WORKSPACE_KEY) === 'true'
    );
  } catch {
    return false;
  }
}

function WorkspaceIcon({ kind }: { kind: 'tutor' | 'code-lab' }) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {kind === 'tutor' ? (
        <>
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
          <path d="m5.6 5.6 2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
          <circle cx="12" cy="12" r="4" />
        </>
      ) : (
        <>
          <path d="m8 7-5 5 5 5" />
          <path d="m16 7 5 5-5 5" />
          <path d="m14 4-4 16" />
        </>
      )}
    </svg>
  );
}

function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <a
      className="logo"
      href="#home"
      onClick={(event) => {
        if (onClick) {
          event.preventDefault();
          onClick();
        }
      }}
      aria-label="CircuitSpark home"
    >
      <span className="brand-mark" aria-hidden="true">
        <svg
          viewBox="0 0 54 54"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            x="1"
            y="1"
            width="52"
            height="52"
            rx="16"
            fill="#DFF5FF"
          />

          <path
            d="M29 13a15 15 0 1 0 0 28"
            stroke="#19678E"
            strokeWidth="5"
            strokeLinecap="round"
          />

          <path
            d="M40 18c-3-3-12-4-15 2-4 9 17 5 15 15-1 7-11 9-17 5"
            stroke="#238FBD"
            strokeWidth="4.5"
            strokeLinecap="round"
          />

          <path
            d="M43 6v8M39 10h8"
            stroke="#18B77A"
            strokeWidth="2.7"
            strokeLinecap="round"
          />

          <circle cx="13" cy="40" r="3" fill="#18B77A" />
        </svg>
      </span>

      <span className="brand-name">
        CircuitSpark<span className="brand-dot">.</span>
      </span>
    </a>
  );
}

function App() {
  const [showTutor, setShowTutor] = useState(
    shouldRestoreWorkspace
  );
  const [activeWorkspace, setActiveWorkspace] = useState<'tutor' | 'code-lab'>(
    () => {
      if (!shouldRestoreWorkspace()) return 'tutor';

      try {
        return sessionStorage.getItem(ACTIVE_WORKSPACE_KEY) === 'code-lab'
          ? 'code-lab'
          : 'tutor';
      } catch {
        return 'tutor';
      }
    }
  );

  // Remember the selected workspace in this tab for page refreshes.
  useEffect(() => {
    if (!showTutor) return;
    try {
      sessionStorage.setItem(ACTIVE_WORKSPACE_KEY, activeWorkspace);
    } catch {
      // Workspace switching still works when storage is unavailable.
    }
  }, [showTutor, activeWorkspace]);

  // Enter the tutor workspace
  function openTutor() {
    try {
      sessionStorage.setItem(WORKSPACE_KEY, 'true');
    } catch (error) {
      console.warn(
        'Could not save workspace navigation state:',
        error
      );
    }

    window.scrollTo({
      top: 0,
      behavior: 'auto',
    });

    setActiveWorkspace('tutor');
    setShowTutor(true);
  }

  // Return to the landing page
  function goHome() {
    try {
      sessionStorage.removeItem(WORKSPACE_KEY);
      sessionStorage.removeItem(ACTIVE_WORKSPACE_KEY);
    } catch (error) {
      console.warn(
        'Could not clear workspace navigation state:',
        error
      );
    }

    setShowTutor(false);
    setActiveWorkspace('tutor');

    window.scrollTo({
      top: 0,
      behavior: 'auto',
    });
  }

  // AI chat workspace
  if (showTutor) {
    return (
      <main className="app tutor-page">
        <nav
          className="navbar tutor-navbar"
          aria-label="AI workspace navigation"
        >
          <Brand onClick={goHome} />

          <div
            role="group"
            aria-label="Workspace tools"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              aria-pressed={activeWorkspace === 'tutor'}
              onClick={() => setActiveWorkspace('tutor')}
              style={{
                padding: '0.65rem 1rem',
                borderRadius: '999px',
                border: '1px solid #D2E7F0',
                background: activeWorkspace === 'tutor' ? '#DFF5FF' : 'transparent',
                color: '#19678E',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <WorkspaceIcon kind="tutor" />
              AI Tutor
            </button>
            <button
              type="button"
              aria-pressed={activeWorkspace === 'code-lab'}
              onClick={() => setActiveWorkspace('code-lab')}
              style={{
                padding: '0.65rem 1rem',
                borderRadius: '999px',
                border: '1px solid #D2E7F0',
                background: activeWorkspace === 'code-lab' ? '#DFF5FF' : 'transparent',
                color: '#19678E',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <WorkspaceIcon kind="code-lab" />
              Code Lab
            </button>
          </div>

          <button
            type="button"
            className="back-home"
            onClick={goHome}
          >
            ← Back to Home
          </button>
        </nav>

        {/* Keep Tutor mounted between tabs so the active chat stays intact. */}
        <div style={{ display: activeWorkspace === 'tutor' ? 'contents' : 'none' }}>
          <Tutor />
        </div>

        <div
          style={{
            display: activeWorkspace === 'code-lab' ? 'block' : 'none',
            width: '100%',
            maxWidth: '1000px',
            margin: '0 auto',
            padding: '2rem 1.5rem',
          }}
        >
          <CodeLab />
        </div>
      </main>
    );
  }

  // Landing page
  return (
    <main className="app" id="home">
      <nav className="navbar" aria-label="Main navigation">
        <Brand />

        <span className="nav-label">
          Learn by building
        </span>

        <a className="nav-link" href="#welcome">
          Meet CircuitSpark ↗
        </a>
      </nav>

      {/* Hero section */}
      <section className="hero">
        <div className="hero-content">
          <p className="eyebrow">
            <span className="status-dot" />
            YOUR LITTLE LAB FOR BIG IDEAS
          </p>

          <h1>
            Curious minds.
            <br />
            <span>Bright ideas.</span>
            <br />
            Real inventions.
          </h1>

          <p className="intro">
            Explore electronics, embedded systems, and code
            with an AI learning companion that helps you
            think, experiment, and discover how things work.
          </p>

          <div className="hero-note">
            <span className="note-icon">✳</span>
            <p>Ask questions. Try things. Figure it out.</p>
          </div>
        </div>

        {/* Original animated illustration */}
        <div
          className="visual-stage"
          aria-label="An animated illustration of an electronic circuit"
        >
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />

          <span className="floating-chip chip-one">
            INPUT
          </span>

          <span className="floating-chip chip-two">
            01001
          </span>

          <span className="floating-chip chip-three">
            OUTPUT
          </span>

          <div className="circuit-core">
            <div className="core-glow" />

            <svg
              viewBox="0 0 220 220"
              role="img"
              aria-label="Circuit board with a glowing light"
            >
              <defs>
                <linearGradient
                  id="boardGradient"
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#DFF7FF" />
                  <stop offset="100%" stopColor="#78C9ED" />
                </linearGradient>
              </defs>

              <rect
                x="35"
                y="35"
                width="150"
                height="150"
                rx="30"
                fill="url(#boardGradient)"
                stroke="#FFFFFF"
                strokeWidth="3"
              />

              <g
                stroke="#FFFFFF"
                strokeWidth="4"
                strokeLinecap="round"
                fill="none"
              >
                <path d="M110 35 V15 H155" />
                <path d="M185 105 H205 V75" />
                <path d="M110 185 V205 H65" />
                <path d="M35 115 H15 V145" />
              </g>

              <g
                fill="#43E89A"
                stroke="#FFFFFF"
                strokeWidth="2"
              >
                <circle cx="155" cy="15" r="6" />
                <circle cx="205" cy="75" r="6" />
                <circle cx="65" cy="205" r="6" />
                <circle cx="15" cy="145" r="6" />
              </g>

              <rect
                x="72"
                y="72"
                width="76"
                height="76"
                rx="18"
                fill="#152B3B"
              />

              <path
                d="M110 88 C96 88 88 98 88 110 C88 120 94 124 98 132 H122 C126 124 132 120 132 110 C132 98 124 88 110 88Z"
                fill="#B7E7F8"
                stroke="#FFFFFF"
                strokeWidth="2"
              />

              <path
                d="M99 137 H121 M101 143 H119"
                stroke="#43E89A"
                strokeWidth="4"
                strokeLinecap="round"
              />

              <path
                d="M110 96 V113 M102 105 H118"
                stroke="#FFFFFF"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <div className="floating-label label-top">
            <span className="label-icon">✦</span>
            <span>
              <strong>Think</strong>
              <small>Explore ideas</small>
            </span>
          </div>

          <div className="floating-label label-bottom">
            <span className="label-icon green-icon">↗</span>
            <span>
              <strong>Build</strong>
              <small>Make it work</small>
            </span>
          </div>

          <span className="tiny-spark spark-one">✦</span>
          <span className="tiny-spark spark-two">✧</span>
          <span className="tiny-spark spark-three">✳</span>
        </div>
      </section>

      {/* Welcome section */}
      <section
        className="welcome-section"
        id="welcome"
        aria-labelledby="welcome-title"
      >
        <div className="welcome-inner">
          <div
            className="assistant-emblem"
            aria-hidden="true"
          >
            <span>CS</span>
            <i>✦</i>
          </div>

          <p className="eyebrow welcome-eyebrow">
            MEET YOUR AI LEARNING COMPANION
          </p>

          <h2 id="welcome-title">
            Welcome to <span>CircuitSpark.</span>
          </h2>

          <p className="welcome-lead">
            Your curiosity is the starting point.
          </p>

          <p className="welcome-description">
            Ask questions about electronics and embedded
            systems, make sense of code, explore project
            ideas, or work through something that's
            confusing you.

            CircuitSpark helps you reason through each
            step, whether you're completely new or
            ready for a bigger challenge.
          </p>

          <p className="welcome-promise">
            Ask a question <span>✳</span>
            Explore an idea <span>✳</span>
            Learn by doing
          </p>

          <button
            type="button"
            className="start-button welcome-start"
            onClick={openTutor}
          >
            Start Exploring
            <span aria-hidden="true">↗</span>
          </button>

          <p className="welcome-note">
            No experience or physical equipment needed
            to begin.
          </p>
        </div>
      </section>

      <footer className="footer">
        <Brand />

        <p>
          Made for curious minds, one discovery at a time.
        </p>
      </footer>
    </main>
  );
}

export default App;
