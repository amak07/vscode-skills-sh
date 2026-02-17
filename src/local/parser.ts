import * as fs from 'fs';
import matter from 'gray-matter';

export interface ParsedSkillMd {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  allowedTools?: string;
  metadata: Record<string, unknown>;
  body: string;
}

export function parseSkillMd(filePath: string): ParsedSkillMd | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseSkillMdContent(content);
  } catch {
    return null;
  }
}

export function parseSkillMdContent(content: string): ParsedSkillMd | null {
  try {
    const { data, content: body } = matter(content);

    const name = typeof data.name === 'string' ? data.name : '';
    const description = typeof data.description === 'string' ? data.description : '';

    if (!name) {
      return null;
    }

    return {
      name,
      description,
      license: typeof data.license === 'string' ? data.license : undefined,
      compatibility: typeof data.compatibility === 'string' ? data.compatibility : undefined,
      allowedTools: typeof data['allowed-tools'] === 'string' ? data['allowed-tools'] : undefined,
      metadata: data as Record<string, unknown>,
      body,
    };
  } catch {
    return null;
  }
}
