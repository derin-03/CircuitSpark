import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from './api';

type ArduinoCompilePanelProps = {
  projectId: string;
  code: string;
};

type CompileResponse = {
  success: boolean;
  board?: string;
  output: string;
  error?: string | null;
};

type SavedResult = {
  code: string;
  projectId: string;
  result: CompileResponse;
};

const ENDPOINT = `${API_BASE_URL}/api/compile/arduino`;

export default function ArduinoCompilePanel({
  projectId,
  code,
}: ArduinoCompilePanelProps) {
  const [compiling, setCompiling] = useState(false);

  const [result, setResult] =
    useState<SavedResult | null>(null);

  const [error, setError] = useState('');

  const requestRef =
    useRef<AbortController | null>(null);

  // Clear old results when the code or project changes.
  useEffect(() => {
    requestRef.current?.abort();
    requestRef.current = null;

    setCompiling(false);
    setResult(null);
    setError('');

    return () => {
      requestRef.current?.abort();
    };
  }, [projectId, code]);

  async function compile() {
    if (compiling || requestRef.current) {
      return;
    }

    if (!code.trim()) {
      setError(
        'Enter some Arduino code before compiling.'
      );
      return;
    }

    const controller = new AbortController();

    requestRef.current = controller;

    setCompiling(true);
    setResult(null);
    setError('');

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },

        body: JSON.stringify({
          code,
        }),

        signal: controller.signal,
      });

      const value: unknown = await response.json();

      if (
        !value ||
        typeof value !== 'object'
      ) {
        throw new Error(
          'Invalid response from the compiler.'
        );
      }

      const data = value as Partial<CompileResponse>;

      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string' &&
            data.error
            ? data.error
            : 'The compilation request failed.'
        );
      }

      if (
        typeof data.success !== 'boolean' ||
        typeof data.output !== 'string'
      ) {
        throw new Error(
          'Invalid response from the compiler.'
        );
      }

      if (!controller.signal.aborted) {
        setResult({
          projectId,
          code,

          result: {
            success: data.success,
            board: data.board,
            output: data.output,
            error: data.error,
          },
        });
      }
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(
          caught instanceof Error &&
            caught.message !== 'Failed to fetch'
            ? caught.message
            : 'Cannot connect to the compiler. Make sure the backend is running.'
        );
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setCompiling(false);
      }
    }
  }

  // Prevent results from another version of the code
  // from being displayed.
  const currentResult =
    result?.projectId === projectId &&
    result.code === code
      ? result.result
      : null;

  return (
    <div
      style={{
        padding: '12px 16px 16px',
        borderTop: '1px solid #d7e5ed',
        background: '#fff',
        textAlign: 'left',
      }}
    >
      {/* COMPILATION CONTROLS */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span
          style={{
            color: '#617789',
            fontSize: 12,
          }}
        >
          Arduino Uno · Compilation only,
          no hardware execution
        </span>

        <button
          type="button"
          className="cs-lab-primary"
          onClick={compile}
          disabled={
            compiling ||
            !code.trim()
          }
          style={{
            minWidth: 112,
          }}
        >
          {compiling
            ? 'Compiling…'
            : '⚙ Compile'}
        </button>
      </div>

      {/* COMPILATION RESULTS */}
      {(compiling || error || currentResult) && (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginTop: 12,
            padding: 13,
            borderRadius: 10,

            border: `1px solid ${
              currentResult
                ? currentResult.success
                  ? '#a5d5bc'
                  : '#ecc1c1'
                : '#d7e5ed'
            }`,

            background: '#f8fbfd',
            color: '#183447',
          }}
        >
          <strong
            style={{
              fontSize: 14,
            }}
          >
            {compiling
              ? 'Compiling your sketch…'
              : error
                ? 'Compiler unavailable'
                : currentResult?.success
                  ? '✓ Compilation successful'
                  : '✕ Compilation failed'}
          </strong>

          {/* CONNECTION OR SERVER ERROR */}
          {error && (
            <p
              style={{
                color: '#a83232',
                fontSize: 13,
              }}
            >
              {error}
            </p>
          )}

          {/* ACTUAL ARDUINO COMPILER OUTPUT */}
          {currentResult && !compiling && (
            <>
              <p
                style={{
                  fontSize: 12,
                  color: '#617789',
                }}
              >
                {currentResult.board ??
                  'Arduino Uno'}{' '}
                · Compiler output
              </p>

              {currentResult.error && (
                <p
                  style={{
                    color: '#a83232',
                    fontSize: 13,
                  }}
                >
                  {currentResult.error}
                </p>
              )}

              <pre
                style={{
                  padding: 12,
                  borderRadius: 8,

                  background: '#eef5f9',
                  color: '#183447',

                  font:
                    '12px/1.65 Consolas, Monaco, monospace',

                  maxHeight: 270,
                  overflow: 'auto',

                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',

                  margin: 0,
                  textAlign: 'left',
                }}
              >
                {currentResult.output ||
                  (currentResult.success
                    ? 'Compilation completed.'
                    : 'Compilation failed without additional output.')}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
