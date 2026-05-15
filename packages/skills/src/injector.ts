import type { Skill } from './schema.js';

const SKILL_SECTION_HEADER = '\n\n---\n## Skills\n\n';
const SKILL_DIVIDER = '\n\n---\n\n';

/**
 * Compose a system prompt from a base prompt and a list of skills.
 * Skills are deduplicated by id and appended after a divider.
 * Returns `base` unchanged when `skills` is empty.
 */
export function composeSystemPrompt(base: string, skills: Skill[]): string {
  if (skills.length === 0) return base;

  // Deduplicate by id, last-write wins
  const deduped = dedupe(skills);

  const skillsSection = deduped
    .map((s) => `### ${s.name}${s.description ? `\n${s.description}` : ''}\n\n${s.body}`)
    .join(SKILL_DIVIDER);

  return `${base}${SKILL_SECTION_HEADER}${skillsSection}`;
}

function dedupe(skills: Skill[]): Skill[] {
  const seen = new Map<string, Skill>();
  for (const s of skills) {
    seen.set(s.id, s);
  }
  return Array.from(seen.values());
}
