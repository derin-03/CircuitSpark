
export function preprocessArduino(code: string): string {
  const hasHeader =
    /^\s*#\s*include\s*[<"]Arduino\.h[>"]/m.test(code);

  const header = hasHeader ? '' : '#include <Arduino.h>\n';

  const prototypes: string[] = [];

  // Recognize common beginner-level function definitions.
  const functionPattern =
    /^[ \t]*(void|int|bool|float|double|long|char)\s+([A-Za-z_]\w*)\s*\(([^(){};]*)\)\s*\{/gm;

  for (const match of code.matchAll(functionPattern)) {
    const [, returnType, name, parameters] = match;

    if (name === 'setup' || name === 'loop') continue;

    // Default parameters need more careful C++ handling.
    if (parameters.includes('=')) continue;

    const declaration =
      `${returnType} ${name}(${parameters.trim()});`;

    // Avoid inserting an identical declaration twice.
    if (!code.includes(declaration) &&
        !prototypes.includes(declaration)) {
      prototypes.push(declaration);
    }
  }

  return header +
    (prototypes.length ? prototypes.join('\n') + '\n' : '') +
    code;
}
