/**
 * Scoped shell-execution tool. Runs commands with `cwd = workspaceDir`,
 * kills on signal, caps output size, enforces a hard timeout. The command
 * is still sandboxed by whatever the host process runs under — callers
 * running in production should launch the API under a constrained user.
 *
 * We intentionally do NOT try to whitelist commands: the agent legitimately
 * needs `npm install`, `npm run build`, `npm run test`, `npm run dev`,
 * `mkdir`, `cp`, `ls`, etc. to scaffold and verify games.
 */

import { spawn } from 'node:child_process';
import type { ToolContext, ToolHandler } from './types.js';

const MAX_OUTPUT_BYTES = 200_000; // 200 KB — enough for a full TS compiler error stream
const DEFAULT_TIMEOUT_MS = 120_000; // 2 min — covers npm install on a cold cache

export const shellTool: ToolHandler<{ command: string; timeout_ms?: number }> = {
  definition: {
    name: 'run_shell',
    description:
      'Run a shell command in the game workspace. Use for scaffolding (cp, mkdir), npm operations (install, run build, run test, run dev), and anything else a developer would run from the project root. Output is captured and returned; long-running servers (npm run dev) should be avoided — prefer checking the build with `npm run build`.',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Full shell command line as a string. Runs via /bin/sh -c.',
        },
        timeout_ms: {
          type: 'number',
          description: 'Hard timeout in milliseconds. Default 120000 (2 minutes).',
        },
      },
      required: ['command'],
    },
  },
  async execute(input, ctx) {
    const timeout = Math.min(Math.max(input.timeout_ms ?? DEFAULT_TIMEOUT_MS, 1000), 600_000);
    return new Promise<string>((resolveP) => {
      const child = spawn('/bin/sh', ['-c', input.command], {
        cwd: ctx.workspaceDir,
        env: process.env,
      });
      let out = '';
      let bytes = 0;
      let truncated = false;

      const collect = (chunk: Buffer): void => {
        bytes += chunk.length;
        if (truncated) return;
        if (bytes > MAX_OUTPUT_BYTES) {
          truncated = true;
          out += chunk.toString('utf8').slice(0, MAX_OUTPUT_BYTES - (bytes - chunk.length));
          out += '\n[output truncated]';
        } else {
          out += chunk.toString('utf8');
        }
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);

      const killTimer = setTimeout(() => {
        child.kill('SIGKILL');
      }, timeout);

      const onAbort = () => child.kill('SIGKILL');
      ctx.signal?.addEventListener('abort', onAbort);

      child.on('exit', (code, signal) => {
        clearTimeout(killTimer);
        ctx.signal?.removeEventListener('abort', onAbort);
        const header = `exit=${code ?? 'null'}${signal ? ` signal=${signal}` : ''}`;
        resolveP(`${header}\n---\n${out}`.trimEnd());
      });
    });
  },
};
