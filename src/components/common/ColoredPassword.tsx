/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

interface ColoredPasswordProps {
  password: string;
  className?: string;
}

type CharKind = 'letter' | 'digit' | 'symbol';

function classifyChar(ch: string): CharKind {
  if (/[0-9]/.test(ch)) return 'digit';
  if (/[a-zA-Z]/.test(ch)) return 'letter';
  return 'symbol';
}

function groupPasswordRuns(password: string): Array<{ kind: CharKind; text: string }> {
  const runs: Array<{ kind: CharKind; text: string }> = [];
  for (const ch of password) {
    const kind = classifyChar(ch);
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) {
      last.text += ch;
    } else {
      runs.push({ kind, text: ch });
    }
  }
  return runs;
}

/**
 * Renders a revealed password with subtle character-class coloring
 * (letters, digits, symbols) grouped into contiguous runs to eliminate
 * O/0 and l/1/I ambiguity while keeping DOM minimal and text selection intact.
 */
export function ColoredPassword({ password, className }: ColoredPasswordProps) {
  const runs = groupPasswordRuns(password);

  if (runs.length === 1 && runs[0]!.kind === 'letter') {
    return <span className={className}>{password}</span>;
  }

  return (
    <span className={className}>
      {runs.map((run, idx) => {
        const tone = run.kind === 'digit'
          ? 'text-brand-secondary'
          : run.kind === 'letter'
            ? 'text-on-surface'
            : 'text-brand-tertiary';
        return (
          <span key={idx} className={tone}>
            {run.text}
          </span>
        );
      })}
    </span>
  );
}
