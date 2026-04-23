/**
 * Filesystem-backed run state. Each run gets a directory under `runsRoot`:
 *
 *   <runsRoot>/<runId>/
 *     state.json        canonical run metadata (append-updated)
 *     events.ndjson     append-only event log — SSE tails this file
 *     workspace/        the actual game project the orchestrator writes into
 *     artifact.zip      lazily produced when GET /runs/:id/artifacts is hit
 *
 * Intentionally simple (JSON files, no DB) — Phase 3 MVP. A durable
 * workflow layer (Vercel Workflow / Inngest / Temporal) plugs in at this
 * seam if/when we need cross-process resumability.
 */

import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, appendFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { GameArchetype } from '@swipi/core';

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type Phase =
  | 'classify'
  | 'scaffold'
  | 'gdd'
  | 'assets'
  | 'config'
  | 'code'
  | 'verify';

export interface RunState {
  runId: string;
  prompt: string;
  archetype?: GameArchetype;
  status: RunStatus;
  currentPhase?: Phase;
  completedPhases: Phase[];
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  error?: string;
}

export interface RunEvent {
  ts: string;
  kind:
    | 'status'
    | 'phase-start'
    | 'phase-complete'
    | 'classification'
    | 'artifact'
    | 'log'
    | 'error'
    | 'done';
  data: unknown;
}

export class RunStorage {
  constructor(public readonly runsRoot: string) {}

  runDir(runId: string): string {
    return join(this.runsRoot, runId);
  }
  workspaceDir(runId: string): string {
    return join(this.runDir(runId), 'workspace');
  }
  statePath(runId: string): string {
    return join(this.runDir(runId), 'state.json');
  }
  eventsPath(runId: string): string {
    return join(this.runDir(runId), 'events.ndjson');
  }
  artifactPath(runId: string): string {
    return join(this.runDir(runId), 'artifact.zip');
  }

  async initRun(runId: string, prompt: string): Promise<RunState> {
    await mkdir(this.workspaceDir(runId), { recursive: true });
    const now = new Date().toISOString();
    const state: RunState = {
      runId,
      prompt,
      status: 'queued',
      completedPhases: [],
      startedAt: now,
      updatedAt: now,
    };
    await this.saveState(state);
    await writeFile(this.eventsPath(runId), '', 'utf8');
    return state;
  }

  async loadState(runId: string): Promise<RunState | null> {
    try {
      const raw = await readFile(this.statePath(runId), 'utf8');
      return JSON.parse(raw) as RunState;
    } catch {
      return null;
    }
  }

  async saveState(state: RunState): Promise<void> {
    state.updatedAt = new Date().toISOString();
    await writeFile(this.statePath(state.runId), JSON.stringify(state, null, 2));
  }

  async updateState(
    runId: string,
    patch: (s: RunState) => void,
  ): Promise<RunState> {
    const state = await this.loadState(runId);
    if (!state) throw new Error(`Run not found: ${runId}`);
    patch(state);
    await this.saveState(state);
    return state;
  }

  async appendEvent(runId: string, event: RunEvent): Promise<void> {
    await appendFile(
      this.eventsPath(runId),
      JSON.stringify(event) + '\n',
      'utf8',
    );
  }

  async hasArtifact(runId: string): Promise<boolean> {
    try {
      await stat(this.artifactPath(runId));
      return true;
    } catch {
      return false;
    }
  }

  streamArtifact(runId: string) {
    return createReadStream(this.artifactPath(runId));
  }

  /** Read the existing events file (used on SSE connect for replay). */
  async readEvents(runId: string): Promise<RunEvent[]> {
    try {
      const raw = await readFile(this.eventsPath(runId), 'utf8');
      if (!raw.trim()) return [];
      return raw
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as RunEvent);
    } catch {
      return [];
    }
  }
}
