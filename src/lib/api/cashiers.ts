export interface Cashier {
	id: number;
	login_id: string;
	name: string;
	active: boolean;
}
async function j<T>(res: Response): Promise<T> {
	const b = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(b?.error || `HTTP ${res.status}`);
	return b.data as T;
}
export const listCashiers = () => fetch('/api/cashiers').then((r) => j<Cashier[]>(r));
export const createCashier = (login_id: string, name: string, pin: string) =>
	fetch('/api/cashiers', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ login_id, name, pin })
	}).then(async (r) => {
		if (r.status === 409) throw new Error('Login ID already in use');
		return j<Cashier>(r);
	});
export const updateCashier = (id: number, name: string, active: boolean) =>
	fetch(`/api/cashiers/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name, active })
	}).then((r) => j<Cashier>(r));
export const updateCashierPin = (id: number, pin: string) =>
	fetch(`/api/cashiers/${id}/pin`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ pin })
	}).then((r) => {
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
	});
export const deleteCashier = (id: number) =>
	fetch(`/api/cashiers/${id}`, { method: 'DELETE' }).then((r) => {
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
	});
