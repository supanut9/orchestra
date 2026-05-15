import { z } from 'zod';

export const SkillSchema = z.object({
  /** Unique identifier — defaults to the file stem (e.g. "git-workflow"). */
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string().optional(),
  tags: z.array(z.string()).optional(),
  /** The Markdown body of the skill (everything after the frontmatter). */
  body: z.string(),
});

export type Skill = z.infer<typeof SkillSchema>;
