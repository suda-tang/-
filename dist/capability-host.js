// A tiny registry so new capability modules can reach the live score/player
// without importing app.js (which owns them as module-level bindings and would
// otherwise force every new feature to be written inside that 1100-line file).
let host = null;

export function registerCapabilityHost(provider) { host = provider || null; }
export function capabilityHost() { return host; }
export function liveScore() { try { return host?.getScore?.() || null; } catch { return null; } }
export function livePlayer() { try { return host?.getPlayer?.() || null; } catch { return null; } }
