import type { SelectionMode } from './optionGroups';

export interface MenuOption {
	name: string;
	price_delta: number;
}
export interface MenuGroup {
	id: number; // shared preset id when isolated=false; clone id when isolated=true
	name: string;
	selection_mode: SelectionMode;
	isolated: boolean;
	options: MenuOption[];
}
export interface BaseOption {
	name: string;
	price: number;
} // THB
export interface Menu {
	id: number;
	name: string;
	price: number; // THB
	category_id: number | null;
	vfd_name: string;
	active: boolean;
	favourite: boolean;
	sort_order: number;
	// The backend omits this field entirely (json:",omitempty") when no
	// photo is attached, rather than sending null — so "no photo" is
	// `undefined`, not `null`.
	image_id?: number;
	option_groups: MenuGroup[];
	base_options: BaseOption[];
}
export interface MenuInput {
	name: string;
	price: number;
	category_id: number | null;
	vfd_name: string;
	favourite: boolean;
}

async function j<T>(res: Response): Promise<T> {
	const b = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(b?.error || `HTTP ${res.status}`);
	return b.data as T;
}
async function ok(res: Response) {
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export const listMenus = () => fetch('/api/menus').then((r) => j<Menu[]>(r));
export const createMenu = (m: MenuInput) =>
	fetch('/api/menus', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(m)
	}).then((r) => j<Menu>(r));
export const updateMenu = (id: number, m: MenuInput) =>
	fetch(`/api/menus/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(m)
	}).then((r) => j<Menu>(r));
export const toggleMenu = (id: number) =>
	fetch(`/api/menus/${id}/toggle`, { method: 'PATCH' }).then(ok);
export const deleteMenu = (id: number) => fetch(`/api/menus/${id}`, { method: 'DELETE' }).then(ok);
export const reorderMenus = (categoryId: number | null, orderedIds: number[]) =>
	fetch('/api/menus/reorder', {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ category_id: categoryId, ordered_ids: orderedIds })
	}).then(ok);

export interface SetGroupsBody {
	groups: (
		| { isolated: false; id: number }
		| { isolated: true; name: string; selection_mode: SelectionMode; options: MenuOption[] }
	)[];
}
export const setMenuGroups = (id: number, body: SetGroupsBody) =>
	fetch(`/api/menus/${id}/option-groups`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	}).then(ok);
export const setMenuBaseOptions = (id: number, base_options: BaseOption[]) =>
	fetch(`/api/menus/${id}/base-options`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ base_options })
	}).then(ok);

// Attaches (imageId a number) or clears (imageId null) a menu item's
// customer-display photo. 204 on success; the backend answers 400 if the
// image id doesn't exist and 404 if the menu doesn't — surface those
// messages (via `j`'s body.error parsing) rather than a bare "HTTP 400".
export const setMenuImage = (id: number, imageId: number | null) =>
	fetch(`/api/menus/${id}/image`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ image_id: imageId })
	}).then(async (r) => {
		if (!r.ok) {
			const b = await r.json().catch(() => ({}));
			throw new Error(b?.error || `HTTP ${r.status}`);
		}
	});
