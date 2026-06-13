export type SelectionMode = 'single_required' | 'single_optional' | 'multi';

export const SELECTION_MODES: { label: string; value: SelectionMode }[] = [
	{ label: 'Pick one (required)', value: 'single_required' },
	{ label: 'Pick one (optional)', value: 'single_optional' },
	{ label: 'Pick any', value: 'multi' }
];

export function isSelectionMode(v: string): v is SelectionMode {
	return v === 'single_required' || v === 'single_optional' || v === 'multi';
}

export interface OptionItem {
	id?: number;
	name: string;
	price_delta: number; // THB
	sort_order: number;
}
export interface OptionGroup {
	id: number;
	name: string;
	selection_mode: SelectionMode;
	options: OptionItem[];
}

async function j<T>(res: Response): Promise<T> {
	const b = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(b?.error || `HTTP ${res.status}`);
	return b.data as T;
}

export const listOptionGroups = () =>
	fetch('/api/option-groups').then((r) => j<OptionGroup[]>(r));

export const createOptionGroup = (name: string, selection_mode: SelectionMode) =>
	fetch('/api/option-groups', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name, selection_mode })
	}).then((r) => j<OptionGroup>(r));

export const updateOptionGroup = (id: number, name: string, selection_mode: SelectionMode) =>
	fetch(`/api/option-groups/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name, selection_mode })
	}).then((r) => j<OptionGroup>(r));

export const deleteOptionGroup = (id: number) =>
	fetch(`/api/option-groups/${id}`, { method: 'DELETE' }).then((r) => {
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
	});

export const createOption = (groupId: number, o: Omit<OptionItem, 'id'>) =>
	fetch(`/api/option-groups/${groupId}/options`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(o)
	}).then((r) => j<OptionItem>(r));

export const updateOption = (id: number, o: Omit<OptionItem, 'id'>) =>
	fetch(`/api/options/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(o)
	}).then((r) => j<OptionItem>(r));

export const deleteOption = (id: number) =>
	fetch(`/api/options/${id}`, { method: 'DELETE' }).then((r) => {
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
	});
