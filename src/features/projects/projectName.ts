/**
 * The name a person may give a project, when renaming it from the list.
 * Pure, so the rule is unit tested. The server takes up to 200 characters.
 */
export const PROJECT_NAME_MAX = 200;

/** The name as it will be saved: one line, no stray spaces. Null when nothing is left. */
export function cleanProjectName(input: string): string | null {
  const name = input.replace(/\s+/g, ' ').trim().slice(0, PROJECT_NAME_MAX).trim();
  return name.length > 0 ? name : null;
}

export type RenameDecision =
  | { kind: 'rename'; name: string }
  /** Nothing typed, or only spaces. */
  | { kind: 'empty' }
  /** The same name it already has: nothing to send. */
  | { kind: 'unchanged' };

export function decideRename(current: string, input: string): RenameDecision {
  const name = cleanProjectName(input);
  if (name === null) return { kind: 'empty' };
  if (name === cleanProjectName(current)) return { kind: 'unchanged' };
  return { kind: 'rename', name };
}
