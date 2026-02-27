import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseSkillMd, parseSkillMdContent } from '../../../local/parser';
import {
  VALID_SKILL_MD,
  MINIMAL_SKILL_MD,
  NO_NAME_SKILL_MD,
  EMPTY_CONTENT,
  NO_FRONTMATTER,
  EXTRA_METADATA_SKILL_MD,
} from '../../helpers/fixtures';

describe('parseSkillMdContent', () => {
  it('extracts all frontmatter fields from valid SKILL.md', () => {
    const result = parseSkillMdContent(VALID_SKILL_MD);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('react-best-practices');
    expect(result!.description).toBe('Best practices for React development');
    expect(result!.license).toBe('MIT');
    expect(result!.compatibility).toBe('claude-code, cursor');
    expect(result!.allowedTools).toBe('Read, Write, Bash');
  });

  it('captures body content after frontmatter', () => {
    const result = parseSkillMdContent(VALID_SKILL_MD);
    expect(result).not.toBeNull();
    expect(result!.body).toContain('# React Best Practices');
    expect(result!.body).toContain('Guidelines for React development.');
  });

  it('returns null when name is missing', () => {
    expect(parseSkillMdContent(NO_NAME_SKILL_MD)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseSkillMdContent(EMPTY_CONTENT)).toBeNull();
  });

  it('returns null for content with no frontmatter', () => {
    expect(parseSkillMdContent(NO_FRONTMATTER)).toBeNull();
  });

  it('parses minimal frontmatter with only name', () => {
    const result = parseSkillMdContent(MINIMAL_SKILL_MD);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('minimal-skill');
    expect(result!.description).toBe('');
    expect(result!.license).toBeUndefined();
    expect(result!.compatibility).toBeUndefined();
    expect(result!.allowedTools).toBeUndefined();
  });

  it('preserves extra metadata keys', () => {
    const result = parseSkillMdContent(EXTRA_METADATA_SKILL_MD);
    expect(result).not.toBeNull();
    expect(result!.metadata.customField).toBe('custom value');
    expect(result!.metadata.anotherField).toBe('another value');
  });

  it('includes standard fields in metadata object', () => {
    const result = parseSkillMdContent(VALID_SKILL_MD);
    expect(result).not.toBeNull();
    expect(result!.metadata.name).toBe('react-best-practices');
    expect(result!.metadata.description).toBe('Best practices for React development');
  });

  it('returns null for malformed YAML', () => {
    const malformed = `---
name: [invalid
  yaml: {{
---
`;
    expect(parseSkillMdContent(malformed)).toBeNull();
  });
});

describe('parseSkillMd (file-based)', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('parses a valid SKILL.md file from disk', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parser-test-'));
    const filePath = path.join(tempDir, 'SKILL.md');
    fs.writeFileSync(filePath, VALID_SKILL_MD);

    const result = parseSkillMd(filePath);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('react-best-practices');
  });

  it('returns null for nonexistent file', () => {
    expect(parseSkillMd('/nonexistent/path/SKILL.md')).toBeNull();
  });
});
