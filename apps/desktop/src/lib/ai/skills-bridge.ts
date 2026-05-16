/**
 * skills-bridge.ts
 *
 * Reads SKILL.md files from:
 *   - <workspace>/.orchestra/skills/
 *   - ~/.orchestra/skills/  (global, user-level)
 *
 * Enabled set is stored in localStorage keyed per workspace path so that
 * enabling a skill for project A does not affect project B.
 *
 * Uses @tauri-apps/plugin-fs to read file content in the Tauri context.
 * Falls back to empty list in non-Tauri environments (tests, Storybook).
 */

import type { Skill } from '@orchestra/skills';
import { composeSystemPrompt } from '@orchestra/skills';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HOME_SKILLS_SUBPATH = '.orchestra/skills';
const WS_SKILLS_SUBPATH = '.orchestra/skills';

function enabledKey(workspacePath: string): string {
  return `orchestra-skills-enabled:${workspacePath}`;
}

function loadEnabledSet(workspacePath: string): Set<string> {
  try {
    const raw = localStorage.getItem(enabledKey(workspacePath));
    if (!raw) return new Set();
    const arr: string[] = JSON.parse(raw);
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function persistEnabledSet(workspacePath: string, ids: Set<string>): void {
  try {
    localStorage.setItem(enabledKey(workspacePath), JSON.stringify(Array.from(ids)));
  } catch {
    // localStorage may be unavailable in some environments
  }
}

/** Attempt to resolve home directory. Returns null in non-Tauri env. */
async function resolveHomeDir(): Promise<string | null> {
  try {
    const { homeDir } = await import('@tauri-apps/api/path');
    return await homeDir();
  } catch {
    return null;
  }
}

/** Read a directory of SKILL.md files using Tauri fs, returning parsed Skill[]. */
async function readSkillsFromDir(dirPath: string): Promise<Skill[]> {
  try {
    const { readDir, readTextFile } = await import('@tauri-apps/plugin-fs');
    const { parseSkillContent } = await import('@orchestra/skills');

    let entries: Array<{ name?: string; isDirectory?: boolean }> = [];
    try {
      entries = await readDir(dirPath, { recursive: true } as any);
    } catch {
      // Directory doesn't exist yet
      return [];
    }

    const skills: Skill[] = [];

    async function processEntries(
      items: Array<{ name?: string; isDirectory?: boolean; children?: any[] }>,
      basePath: string,
    ): Promise<void> {
      for (const entry of items) {
        if (!entry.name) continue;
        const fullPath = `${basePath}/${entry.name}`;
        if ((entry as any).isDirectory || (entry as any).children) {
          const children = (entry as any).children ?? [];
          await processEntries(children, fullPath);
        } else if (entry.name === 'SKILL.md') {
          try {
            const content = await readTextFile(fullPath);
            // Use the parent directory name as the default id
            const parts = basePath.split('/');
            const defaultId = parts[parts.length - 1] ?? 'unknown';
            const skill = parseSkillContent(content, defaultId);
            // Tag with source path for display
            skills.push({ ...skill, _sourcePath: fullPath } as Skill & { _sourcePath: string });
          } catch (err) {
            console.warn(`[skills-bridge] Failed to parse ${fullPath}:`, err);
          }
        }
      }
    }

    await processEntries(entries, dirPath);
    skills.sort((a, b) => a.id.localeCompare(b.id));
    return skills;
  } catch (err) {
    console.warn('[skills-bridge] readSkillsFromDir failed:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SkillWithMeta extends Skill {
  /** Full path to the SKILL.md file. */
  sourcePath: string;
  /** 'workspace' | 'global' */
  sourceScope: 'workspace' | 'global';
}

/** List all skills from workspace and global skill directories. */
export async function listAllSkills(
  workspacePath: string | null | undefined,
): Promise<SkillWithMeta[]> {
  const results: SkillWithMeta[] = [];

  const home = await resolveHomeDir();
  if (home) {
    const globalSkills = await readSkillsFromDir(`${home}/${HOME_SKILLS_SUBPATH}`);
    for (const s of globalSkills) {
      results.push({
        ...s,
        sourcePath: (s as any)._sourcePath ?? `${home}/${HOME_SKILLS_SUBPATH}`,
        sourceScope: 'global',
      });
    }
  }

  if (workspacePath) {
    const wsSkills = await readSkillsFromDir(`${workspacePath}/${WS_SKILLS_SUBPATH}`);
    for (const s of wsSkills) {
      results.push({
        ...s,
        sourcePath: (s as any)._sourcePath ?? `${workspacePath}/${WS_SKILLS_SUBPATH}`,
        sourceScope: 'workspace',
      });
    }
  }

  return results;
}

/** Enable or disable a skill for the given workspace. */
export function setEnabled(workspacePath: string, skillId: string, enabled: boolean): void {
  const set = loadEnabledSet(workspacePath);
  if (enabled) {
    set.add(skillId);
  } else {
    set.delete(skillId);
  }
  persistEnabledSet(workspacePath, set);
}

/** Return the set of enabled skill IDs for a workspace. */
export function getEnabledIds(workspacePath: string): Set<string> {
  return loadEnabledSet(workspacePath);
}

/** Return all currently enabled Skill objects. */
export async function getEnabledSkills(workspacePath: string): Promise<Skill[]> {
  const all = await listAllSkills(workspacePath);
  const enabled = loadEnabledSet(workspacePath);
  return all.filter((s) => enabled.has(s.id));
}

/**
 * Compose a system prompt by appending enabled skills.
 * Pass the base prompt; returns base + skills section.
 */
export async function composePromptWithSkills(
  workspacePath: string,
  base: string,
): Promise<string> {
  const skills = await getEnabledSkills(workspacePath);
  return composeSystemPrompt(base, skills);
}

/** Write a sample SKILL.md to the workspace skills directory. */
export async function createExampleSkill(workspacePath: string): Promise<void> {
  const dir = `${workspacePath}/${WS_SKILLS_SUBPATH}/example`;
  const content = `---
id: example-skill
name: Example Skill
description: A template skill to help you get started with Orchestra skills.
version: 1.0.0
tags: [example, template]
---

## Overview

This is an example skill. Replace this content with your own instructions,
conventions, or domain knowledge that you want the AI to apply consistently.

## Guidelines

- Be explicit about the conventions you want followed.
- Keep skills focused — one concern per SKILL.md.
- Use markdown headings to organise sections.
`;

  try {
    const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
    await mkdir(dir, { recursive: true }).catch(() => {});
    await writeTextFile(`${dir}/SKILL.md`, content);
  } catch (err) {
    console.warn('[skills-bridge] createExampleSkill failed (non-Tauri env?):', err);
  }
}

/** Open the workspace skills folder in the OS file manager. */
export async function openSkillsFolder(workspacePath: string): Promise<void> {
  const dir = `${workspacePath}/${WS_SKILLS_SUBPATH}`;
  try {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(dir);
  } catch (err) {
    console.warn('[skills-bridge] openSkillsFolder failed:', err);
  }
}
