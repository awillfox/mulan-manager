/** Change the logged-in manager's own password. Throws with a friendly message
 *  ("Current password is incorrect" on 401). */
export async function changePassword(current_password: string, new_password: string): Promise<void> {
	const res = await fetch('/api/auth/change-password', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ current_password, new_password })
	});
	if (res.ok) return;
	const body = await res.json().catch(() => ({}));
	if (res.status === 401) throw new Error(body?.error || 'Current password is incorrect');
	throw new Error(body?.error || `HTTP ${res.status}`);
}
