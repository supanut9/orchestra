import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseSkill } from './parser.js';
import type { Skill } from './schema.js';

/**
 * Walk `dir` recursively and parse every `SKILL.md` file found.
 * Returns all skills sorted by id.
 */
export async function loadSkills(dir: string): Promise<Skill[]> {
  const skills: Skill[] = [];
  await walk(dir, skills);
  skills.sort((a, b) => a.id.localeCompare(b.id));
  return skills;
}

async function walk(dir: string, acc: Skill[]): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    // Directory might not exist yet — treat as empty
    return;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const full = join(dir, entry);
      const info = await stat(full);
      if (info.isDirectory()) {
        await walk(full, acc);
      } else if (entry === 'SKILL.md') {
        try {
          const skill = await parseSkill(full);
          acc.push(skill);
        } catch (err) {
          console.warn(`[skills] failed to parse ${full}:`, err);
        }
      }
    }),
  );
}
