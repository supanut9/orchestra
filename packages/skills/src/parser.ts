import matter from 'gray-matter';
import { SkillSchema } from './schema.js';
import type { Skill } from './schema.js';

/**
 * Parse raw SKILL.md content (frontmatter + body).
 * `defaultId` is used when the frontmatter has no `id` field.
 * Pure function — safe to call from browser bundles.
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
