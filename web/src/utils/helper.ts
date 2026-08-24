// Resolved once at startup by resolveOnlineStatus() and read synchronously by
// isOnLine() everywhere else. null = not resolved yet.
let onlineStatusCache: boolean | null = null;

/**
 * Decide online/offline WITHOUT a network call, when possible.
 * Returns true/false when determinable, or null when a backend probe is needed.
 * - dev environment                        → online
 * - ONLINE_HOST unset (no known offline build for SIREN yet) → online
 * - hostname is the configured online host → online
 * - file:// (no host) / localhost          → offline (local launcher build)
 * - direct IP / other host                 → null (can't tell synchronously; must probe)
 */
function classifyOnlineSync(): boolean | null {
  if (import.meta.env.ENVIRONMENT === 'dev') return true;

  const onlineHost = import.meta.env.ONLINE_HOST ?? '';
  if (!onlineHost) return true;

  const host = window.location.hostname; // '' for file://, 'localhost', IP, or the deployed domain
  if (host === onlineHost || host.endsWith(`.${onlineHost}`)) return true;

  // file:// and a local offline launcher build are always offline.
  if (host === '' || host === 'localhost' || host === '127.0.0.1') return false;

  // Direct server-IP (or other) access: the domain didn't match, but this may
  // still be a real online deployment reached by IP. Decide via a backend probe.
  return null;
}

/** One lightweight, auth-free GET to SIREN's own backend. 2xx within the timeout → online. */
async function probeBackend(timeoutMs = 3000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${import.meta.env.SIREN_API}/projects`, {
      method: 'GET',
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve and cache online status. Awaited once at startup (main.tsx) before
 * rendering, so every synchronous isOnLine() call sees a settled value.
 * Fast path (dev / matching domain / file:// / localhost) skips the probe.
 */
export async function resolveOnlineStatus(): Promise<boolean> {
  const sync = classifyOnlineSync();
  onlineStatusCache = sync !== null ? sync : await probeBackend();
  return onlineStatusCache;
}

/** Test-only: clear the resolved cache so classification runs fresh. */
export function resetOnlineStatusCache(): void {
  onlineStatusCache = null;
}

export function isOnLine(): boolean {
  if (onlineStatusCache !== null) return onlineStatusCache;
  // Not resolved yet: use the synchronous verdict; an undecidable host (needs a
  // probe) defaults to offline until resolveOnlineStatus() settles it.
  return classifyOnlineSync() ?? false;
}
