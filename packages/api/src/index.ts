/**
 * @swipi/api — library entry point for programmatic embedding.
 *
 * Typical consumers:
 *   - The CLI (src/cli.ts) wires this up with @hono/node-server.
 *   - Users embedding the API in an existing HTTP framework can compose
 *     createApp(...) directly.
 */

export { createApp } from './server.js';
export type { ServerOptions } from './server.js';
export { RunManager } from './runs/manager.js';
export type { RunManagerOptions, StartRunInput } from './runs/manager.js';
export { RunStorage } from './runs/state.js';
export type { RunState, RunEvent, RunStatus, Phase } from './runs/state.js';
export { PlaceholderAssetProvider } from './providers/placeholder-assets.js';
export { zipDirectory } from './utils/zip.js';
