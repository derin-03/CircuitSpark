
import { useEffect, useRef, useState } from 'react';
import { compile as compileArduino } from '@horang-corp/avr-gcc-wasm';

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

export default function ArduinoCompilePanel({
  projectId,
  code,
}: ArduinoCompilePanelProps) {
  const [compiling, setCompiling] = useState(false);
  const [result, setResult] = useState<SavedResult | null>(null);
  const [error, setError] = useState('');

  const busyRef = useRef(false);
  const versionRef = useRef(0);

  // Clear previous results when the code or project changes.
  useEffect(() => {
    versionRef.current += 1;
    setResult(null);
    setError('');

    return () => {
      versionRef.current += 1;
    };
  }, [projectId, code]);

  async function compile() {
    if (busyRef.current) return;

    if (!code.trim()) {
      setError('Enter some Arduino code before compiling.');
      return;
    }

    busyRef.current = true;
    const version = versionRef.current;

    setCompiling(true);
    setResult(null);
    setError('');

    try {
      // Arduino normally adds this header automatically.
      const hasArduinoHeader =
        /^\s*#\s*include\s*[<"]Arduino\.h[>"]/m.test(code);

      const source = hasArduinoHeader
        ? code
        : '#include <Arduino.h>\n' + code;

      // Compile on the learner's device, not on Render.
      const compiled = await compileArduino({
        source,
        sensors: [],
        assetsBase: new URL('/avr/', window.location.origin),
      });

      const hexGenerated =
        typeof compiled.hex === 'string' &&
        compiled.hex.length > 0;

      const success = hexGenerated && compiled.fitsTarget;

      const output = !hexGenerated
        ? 'The compiler did not generate a HEX file.'
        : !compiled.fitsTarget
          ? 'Compilation generated a HEX file, but the program does not fit the target board.'
          : [
              'Compilation completed.',
              'Board: Arduino Uno',
              'Fits Arduino Uno flash: Yes',
              'HEX generated: Yes',
              `HEX length: ${compiled.hex.length} characters`,
            ].join('\n');

      if (version === versionRef.current) {
        setResult({
          projectId,
          code,
          result: {
            success,
            board: 'Arduino Uno',
            output,
          },
        });
      }
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : String(caught);

      if (version === versionRef.current) {
        if (/\berror:/i.test(message)) {
          // Actual Arduino compilation error.
          setResult({
            projectId,
            code,
            result: {
              success: false,
              board: 'Arduino Uno',
              output: message,
            },
          });
        } else {
          // Browser worker or compiler-loading failure.
          setError(`Browser compiler failed: ${message}`);
        }
      }
    } finally {
      busyRef.current = false;
      setCompiling(false);
    }
  }

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
          disabled={compiling || !code.trim()}
          style={{ minWidth: 112 }}
        >
          {compiling ? 'Compiling…' : '⚙ Compile'}
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
          <strong style={{ fontSize: 14 }}>
            {compiling
              ? 'Compiling your sketch…'
              : error
                ? 'Compiler unavailable'
                : currentResult?.success
                  ? '✓ Compilation successful'
                  : '✕ Compilation failed'}
          </strong>

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

          {currentResult && !compiling && (
            <>
              <p
                style={{
                  fontSize: 12,
                  color: '#617789',
                }}
              >
                {currentResult.board ?? 'Arduino Uno'}{' '}
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
