export async function notifyTaskAssigned(payload = {}) {
  console.log('[taskNotify] Attempting to send notification with payload:', payload);
  try {
    const backendUrl = import.meta.env.VITE_BACKEND_URL;
    if (!backendUrl) {
      console.warn('[taskNotify] VITE_BACKEND_URL is not configured. Silently skipping notification.');
      return;
    }

    if (!payload.assigned_to_email || !payload.task_title) {
      console.warn('[taskNotify] Missing required fields (assigned_to_email, task_title). Skipping.');
      return;
    }

    const res = await fetch(`${backendUrl}/api/notify-task-assigned`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text(); // Get response text regardless of status

    if (res.ok) {
      console.log('[taskNotify] Notification request sent successfully. Backend response:', responseText);
    } else {
      console.error(`[taskNotify] Notification request failed with status ${res.status}. Backend response:`, responseText);
    }
  } catch (error) {
    console.error('[taskNotify] A network or unexpected error occurred:', error);
  }
}
