export interface Category {
	id: number;
	name: string;
}
async function j<T>(res: Response): Promise<T> {
	const b = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(b?.error || `HTTP ${res.status}`);
	return b.data as T;
}
export const listCategories = () => fetch('/api/menu-categories').then((r) => j<Category[]>(r));
export const createCategory = (name: string) =>
	fetch('/api/menu-categories', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name })
	}).then((r) => j<Category>(r));
export const updateCategory = (id: number, name: string) =>
	fetch(`/api/menu-categories/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name })
	}).then((r) => j<Category>(r));
export const deleteCategory = (id: number) =>
	fetch(`/api/menu-categories/${id}`, { method: 'DELETE' }).then((r) => {
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
	});
