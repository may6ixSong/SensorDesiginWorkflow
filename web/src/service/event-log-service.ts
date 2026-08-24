import axios from 'axios';

interface EventLogPayload {
  userId: string;
  project: string;
  event: string;
  action: string;
}

/**
 * Best-effort login/usage analytics. SIREN's backend doesn't expose this
 * endpoint yet (api/ is intentionally untouched here) — failures are silent
 * so this never blocks the login flow that calls it.
 */
export async function addEventLog(payload: EventLogPayload): Promise<void> {
  if (!import.meta.env.SIREN_API) return;
  try {
    await axios.post(`${import.meta.env.SIREN_API}/event-log`, payload);
  } catch {
    // best-effort only
  }
}
