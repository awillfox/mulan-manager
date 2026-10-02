export interface VoidReason {
	code: string;
	label: string;
}
export interface VoidItemReq {
	order_item_id: number;
	qty: number;
}
export interface VoidReq {
	scope: 'items' | 'order';
	items?: VoidItemReq[];
	reason_code?: string;
	reason_text?: string;
}
export interface VoidRes {
	refund_amount: number;
	refund_method: string;
	refund_breakdown: Record<string, number>;
	points_reversed: number;
	order_status: string;
	manual_refund: boolean;
}

export const OTHER = 'other';
const MAX_TEXT = 500;

async function j<T>(res: Response): Promise<T> {
	const b = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(b?.error || `HTTP ${res.status}`);
	return b.data as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
	return fetch(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	}).then((r) => j<T>(r));
}

export const listVoidReasons = () =>
	fetch('/api/orders/void-reasons').then((r) => j<VoidReason[]>(r));
export const previewVoid = (code: string, req: VoidReq) =>
	post<VoidRes>(`/api/orders/${encodeURIComponent(code)}/void/preview`, req);
export const voidOrder = (code: string, req: VoidReq) =>
	post<VoidRes>(`/api/orders/${encodeURIComponent(code)}/void`, req);

export function buildVoidReq(
	whole: boolean,
	qtys: Record<number, number>,
	reason: string,
	text: string
): VoidReq {
	const reason_text = text.trim();
	if (whole) return { scope: 'order', reason_code: reason, reason_text };
	const items = Object.entries(qtys)
		.map(([id, qty]) => ({ order_item_id: Number(id), qty }))
		.filter((i) => i.qty > 0);
	return { scope: 'items', items, reason_code: reason, reason_text };
}

export function reasonValid(reason: string, text: string): boolean {
	if (!reason) return false;
	const t = text.trim();
	if ([...t].length > MAX_TEXT) return false;
	return reason !== OTHER || t.length > 0;
}

export function breakdownLines(b: Record<string, number>): string[] {
	return Object.entries(b ?? {})
		.map(([satang, n]) => [Number(satang), n] as const)
		.filter(([, n]) => n > 0)
		.sort((a, b) => b[0] - a[0])
		.map(([satang, n]) => `฿${satang / 100} × ${n}`);
}
