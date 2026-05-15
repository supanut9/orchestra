import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import matter from 'gray-matter';
import { SkillSchema } from './schema.js';
import type { Skill } from './schema.js';

/**
 * Parse a SKILL.md file from disk.
 * The file stem is used as fallback `id` if the frontmatter doesn't define one.
 */
export async function parseSkill(filePath: string): Promise<Skill> {
  const raw = await readFile(filePath, 'utf-8');
  const stem = basename(filePath, extname(filePath));
  return parseSkillContent(raw, stem);
}

/**
 * Parse raw SKILL.md content (frontmatter + body).
 * `defaultId` is used when the frontmatter has no `id` field.
 */
export function parseSkillContent(raw: string, defaultId = 'unknown'): Skill {
  const { data, content } = matter(raw);

  return SkillSchema.parse({
    id: data['id'] ?? defaultId,
    name: data['name'] ?? defaultId,
    description: data['description'] ?? '',
    version: data['version'],
    tags: data['tags'],
    body: content.trim(),
  });
}
