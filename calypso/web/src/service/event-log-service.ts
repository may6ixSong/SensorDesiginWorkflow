import axios from 'axios';

interface EventLogPayload {
  userId: string;
  project: string;
  event: string;
  action: string;
}

/**
 * Best-effort login/usage analytics. Calypso's own backend doesn't expose this
 * endpoint yet (calypso/ is intentionally untouched here) — failures are
 * silent so this never blocks the login flow that calls it.
 */
export async function addEventLog(payload: EventLogPayload): Promise<void> {
  if (!import.meta.env.CALYPSO_API) return;
  try {
    await axios.post(`${import.meta.env.CALYPSO_API}/event-log`, payload);
  } catch {
    // best-effort only
  }
}
