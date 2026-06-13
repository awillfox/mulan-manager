export interface Member {
	id: number;
	phone: string;
	name: string;
	points: number;
	created_at: string;
}
export interface MemberOrder {
	code: string;
	created_at: string;
	points_earned: number;
	subtotal: number; // THB
}
async function j<T>(res: Response): Promise<T> {
	const b = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(b?.error || `HTTP ${res.status}`);
	return b.data as T;
}
export const listMembers = (q = '') =>
	fetch(`/api/members${q ? `?q=${encodeURIComponent(q)}` : ''}`).then((r) => j<Member[]>(r));
export const memberOrders = (id: number) =>
	fetch(`/api/members/${id}/orders`).then((r) => j<MemberOrder[]>(r));
export const createMember = (phone: string, name: string) =>
	fetch('/api/members', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ phone, name })
	}).then(async (r) => {
		if (r.status === 409) throw new Error('Phone already registered');
		return j<Member>(r);
	});
export const updateMember = (id: number, phone: string, name: string) =>
	fetch(`/api/members/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ phone, name })
	}).then(async (r) => {
		if (r.status === 409) throw new Error('Phone already registered');
		return j<Member>(r);
	});
export const deleteMember = (id: number) =>
	fetch(`/api/members/${id}`, { method: 'DELETE' }).then((r) => {
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
	});
