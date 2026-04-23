/**
 * RunManager — owns run lifecycle. Kicks off orchestration in the
 * background, persists state + events to `RunStorage`, notifies in-memory
 * SSE subscribers, and exposes `subscribe()` for the events endpoint.
 */

import { EventEmitter } from 'node:events';
import type { LLMClient, AssetProvider, GameArchetype } from '@swipi/core';
import { runOrchestration } from './pipeline.js';
import type { RunEvent, RunState } from './state.js';
import { RunStorage } from './state.js';

export interface RunManagerOptions {
  runsRoot: string;
  llm: LLMClient;
  assetProvider: AssetProvider;
  sharedDir: string;
}

export interface StartRunInput {
  prompt: string;
  archetype?: GameArchetype;
}

export class RunManager {
  readonly storage: RunStorage;
  private readonly bus = new EventEmitter();

  constructor(private readonly options: RunManagerOptions) {
    this.storage = new RunStorage(options.runsRoot);
    // Avoid leak warnings on fan-out to many SSE clients for one long run.
    this.bus.setMaxListeners(0);
  }

  async start(input: StartRunInput): Promise<RunState> {
    const runId = crypto.randomUUID();
    const state = await this.storage.initRun(runId, input.prompt);
    if (input.archetype) {
      state.archetype = input.archetype;
      await this.storage.saveState(state);
    }

    // Fire and forget — orchestration writes back through storage + bus.
    void this.executeRun(runId, input).catch(async (err) => {
      const message = err instanceof Error ? err.message : String(err);
      await this.storage
        .updateState(runId, (s) => {
          s.status = 'failed';
          s.error = message;
          s.finishedAt = new Date().toISOString();
        })
        .catch(() => undefined);
      await this.emit(runId, { kind: 'error', data: { message } });
      await this.emit(runId, { kind: 'done', data: { status: 'failed' } });
    });

    return state;
  }

  async getState(runId: string): Promise<RunState | null> {
    return this.storage.loadState(runId);
  }

  /**
   * Subscribe to events for a run. Replays historical events first
   * (so late subscribers catch up), then streams live events until the
   * client unsubscribes or the run completes.
   */
  async *subscribe(runId: string): AsyncGenerator<RunEvent> {
    const state = await this.storage.loadState(runId);
    if (!state) throw new Error(`Run not found: ${runId}`);

    // Replay all historical events.
    const replay = await this.storage.readEvents(runId);
    for (const event of replay) yield event;

    // If already terminal, we're done.
    if (state.status === 'succeeded' || state.status === 'failed') return;

    // Otherwise, subscribe to the live stream.
    const queue: RunEvent[] = [];
    let resolve: ((v: RunEvent | null) => void) | null = null;
    let closed = false;

    const onEvent = (event: RunEvent) => {
      if (closed) return;
      if (resolve) {
        resolve(event);
        resolve = null;
      } else {
        queue.push(event);
      }
    };
    const channel = runId;
    this.bus.on(channel, onEvent);

    try {
      while (!closed) {
        const next = queue.shift();
        if (next) {
          yield next;
          if (next.kind === 'done') break;
          continue;
        }
        const event = await new Promise<RunEvent | null>((r) => {
          resolve = r;
        });
        if (event === null) break;
        yield event;
        if (event.kind === 'done') break;
      }
    } finally {
      closed = true;
      this.bus.off(channel, onEvent);
      const pending = resolve as ((v: RunEvent | null) => void) | null;
      if (pending) pending(null);
    }
  }

  private async emit(runId: string, partial: Omit<RunEvent, 'ts'>): Promise<void> {
    const event: RunEvent = { ts: new Date().toISOString(), ...partial };
    await this.storage.appendEvent(runId, event);
    this.bus.emit(runId, event);
  }

  private async executeRun(runId: string, input: StartRunInput): Promise<void> {
    await this.storage.updateState(runId, (s) => {
      s.status = 'running';
    });
    await this.emit(runId, { kind: 'status', data: { status: 'running' } });

    await runOrchestration({
      runId,
      input,
      storage: this.storage,
      llm: this.options.llm,
      assetProvider: this.options.assetProvider,
      sharedDir: this.options.sharedDir,
      emit: (e) => this.emit(runId, e),
    });

    await this.emit(runId, { kind: 'done', data: { status: 'succeeded' } });
  }
}
