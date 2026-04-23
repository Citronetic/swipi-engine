/**
 * Filesystem tools scoped to the agent's workspace directory.
 *
 * Every path the agent asks for is resolved relative to `ctx.workspaceDir`
 * and rejected if it escapes that root. This prevents a prompt-injection
 * exploit from the LLM asking for `../../etc/passwd`.
 */

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { ToolContext, ToolHandler } from './types.js';

function resolveInside(ctx: ToolContext, raw: string): string {
  if (!raw || typeof raw !== 'string') {
    throw new Error('path must be a non-empty string');
  }
  const rooted = isAbsolute(raw) ? raw : join(ctx.workspaceDir, raw);
  const abs = resolve(rooted);
  const rel = relative(ctx.workspaceDir, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(
      `path "${raw}" escapes the workspace. Only paths under the project root are writable.`,
    );
  }
  return abs;
}

const MAX_READ_BYTES = 500_000; // ~500 KB — enough for any source file, caps runaway reads

export const readFileTool: ToolHandler<{ path: string }> = {
  definition: {
    name: 'read_file',
    description:
      'Read a UTF-8 text file from the game workspace. Path is resolved relative to the workspace root. Large files are truncated to 500 KB.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path relative to the workspace root (e.g., "src/main.ts").',
        },
      },
      required: ['path'],
    },
  },
  async execute(input, ctx) {
    const abs = resolveInside(ctx, input.path);
    const s = await stat(abs).catch(() => null);
    if (!s) return `File not found: ${input.path}`;
    if (!s.isFile()) return `Not a file: ${input.path}`;
    const buf = await readFile(abs);
    if (buf.length > MAX_READ_BYTES) {
      return `${buf.subarray(0, MAX_READ_BYTES).toString('utf8')}\n\n[truncated — file is ${buf.length} bytes]`;
    }
    return buf.toString('utf8');
  },
};

export const writeFileTool: ToolHandler<{ path: string; content: string }> = {
  definition: {
    name: 'write_file',
    description:
      'Write (or overwrite) a text file in the workspace. Creates parent directories as needed. Use for creating new source files; prefer edit_file for partial modifications.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the workspace root.' },
        content: { type: 'string', description: 'Full file content to write.' },
      },
      required: ['path', 'content'],
    },
  },
  async execute(input, ctx) {
    const abs = resolveInside(ctx, input.path);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, input.content, 'utf8');
    return `Wrote ${input.content.length} bytes to ${input.path}`;
  },
};

export const editFileTool: ToolHandler<{
  path: string;
  old_string: string;
  new_string: string;
}> = {
  definition: {
    name: 'edit_file',
    description:
      'Replace an exact substring in an existing file. `old_string` must match uniquely — if multiple matches exist, the tool returns an error and you must expand `old_string` to be unambiguous. Faster than write_file for targeted changes.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the workspace root.' },
        old_string: {
          type: 'string',
          description: 'Exact text to replace. Must match once and only once.',
        },
        new_string: {
          type: 'string',
          description: 'Replacement text.',
        },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  async execute(input, ctx) {
    const abs = resolveInside(ctx, input.path);
    const existing = await readFile(abs, 'utf8').catch((): null => null);
    if (existing === null) return `File not found: ${input.path}`;
    const hits = existing.split(input.old_string).length - 1;
    if (hits === 0) return `old_string not found in ${input.path}`;
    if (hits > 1) {
      return `old_string matched ${hits} times in ${input.path}. Expand old_string to be unique.`;
    }
    const updated = existing.replace(input.old_string, input.new_string);
    await writeFile(abs, updated, 'utf8');
    return `Edited ${input.path}: -${input.old_string.length}+${input.new_string.length} chars`;
  },
};

export const listFilesTool: ToolHandler<{ path?: string; recursive?: boolean }> = {
  definition: {
    name: 'list_files',
    description:
      'List files and directories under a workspace path. Returns one path per line, relative to the workspace root. Pass recursive=true for a full tree; otherwise only direct children.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path relative to the workspace root. Defaults to the workspace root.',
        },
        recursive: {
          type: 'boolean',
          description: 'If true, walks the full subtree. Default false.',
        },
      },
    },
  },
  async execute(input, ctx) {
    const base = resolveInside(ctx, input.path ?? '.');
    const results: string[] = [];
    const walker = async (dir: string, depth: number): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
          continue;
        }
        const abs = join(dir, entry.name);
        const rel = relative(ctx.workspaceDir, abs);
        if (entry.isDirectory()) {
          results.push(`${rel}/`);
          if (input.recursive && depth < 8) {
            await walker(abs, depth + 1);
          }
        } else {
          results.push(rel);
        }
      }
    };
    await walker(base, 0);
    results.sort();
    return results.length === 0 ? '(empty)' : results.join('\n');
  },
};
