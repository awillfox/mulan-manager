export type DiscountType = 'fixed' | 'percent';

export interface Discount {
	id: number;
	name: string;
	discount_type: DiscountType;
	value: number; // THB for fixed, percent for percent
	active: boolean;
	is_subsidy: boolean;
}

export interface DiscountInput {
	name: string;
	discount_type: DiscountType;
	value: number;
	active: boolean;
	is_subsidy: boolean;
}

async function json<T>(res: Response): Promise<T> {
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
	return body.data as T;
}

export const listDiscounts = () => fetch('/api/discounts').then((r) => json<Discount[]>(r));

export const createDiscount = (input: DiscountInput) =>
	fetch('/api/discounts', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input)
	}).then((r) => json<Discount>(r));

export const updateDiscount = (id: number, input: DiscountInput) =>
	fetch(`/api/discounts/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input)
	}).then((r) => json<Discount>(r));

export const deleteDiscount = (id: number) =>
	fetch(`/api/discounts/${id}`, { method: 'DELETE' }).then((r) => {
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
	});
