export async function notifyTaskAssigned(payload = {}) {
  try {
    const backendUrl = import.meta.env.VITE_BACKEND_URL;
    if (!backendUrl) {
      // Backend not configured; silently no-op
      return;
    }

    // Minimal required fields
    if (!payload.assigned_to_email || !payload.event_title) {
      return;
    }

    const res = await fetch(`${backendUrl}/api/notify-task-assigned`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Non-blocking; ignore failures in UI flow
    await res.text().catch(() => {});
  } catch {
    // swallow errors to avoid breaking UI
  }
}
