import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { parseSkillContent } from './parser.js';
import type { Skill } from './schema.js';

/**
 * Parse a SKILL.md file from disk. Node-only (uses fs).
 */
export async function parseSkill(filePath: string): Promise<Skill> {
  const raw = await readFile(filePath, 'utf-8');
  const stem = basename(filePath, extname(filePath));
  return parseSkillContent(raw, stem);
}

/**
 * Walk `dir` recursively and parse every `SKILL.md` file found. Node-only.
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
