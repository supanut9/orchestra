import { describe, it, expect } from 'vitest';
import { parseSkillContent, composeSystemPrompt } from './index.js';

describe('skills', () => {
  it('parseSkillContent parses frontmatter and body', () => {
    const raw = `---
name: Git Workflow
description: Best practices for branching
id: git-workflow
---

Always create a feature branch.
`;
    const skill = parseSkillContent(raw, 'git-workflow');
    expect(skill.id).toBe('git-workflow');
    expect(skill.name).toBe('Git Workflow');
    expect(skill.body).toContain('feature branch');
  });

  it('composeSystemPrompt appends skills to base', () => {
    const skill = parseSkillContent(
      `---
name: Test Skill
description: A test
id: test-skill
---
Do the thing.`,
      'test-skill',
    );
    const result = composeSystemPrompt('You are helpful.', [skill]);
    expect(result).toContain('You are helpful.');
    expect(result).toContain('Test Skill');
    expect(result).toContain('Do the thing.');
  });

  it('composeSystemPrompt returns base unchanged when skills is empty', () => {
    const base = 'You are helpful.';
    expect(composeSystemPrompt(base, [])).toBe(base);
  });

  it('composeSystemPrompt deduplicates skills by id', () => {
    const skill = parseSkillContent(
      `---
name: Dup Skill
description: Duplicate
id: dup
---
Content.`,
      'dup',
    );
    const result = composeSystemPrompt('Base.', [skill, skill]);
    const count = (result.match(/Dup Skill/g) ?? []).length;
    expect(count).toBe(1);
  });
});
