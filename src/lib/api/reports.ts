export interface OptionLine {
	name: string;
	price_delta: number;
}
export interface OrderLine {
	name: string;
	base_option_name: string;
	qty: number;
	price: number;
	options: OptionLine[];
}
export interface OrderDiscount {
	name: string;
	discount_type: string;
	amount: number;
	is_subsidy: boolean;
}
export interface OrderRow {
	code: string;
	status: string;
	created_at: string;
	paid_at: string | null;
	member_name: string;
	member_phone: string;
	points_earned: number;
	item_count: number;
	qty: number;
	gross: number;
	discount: number;
	subsidy: number;
	net: number;
	line_items: OrderLine[];
	discounts: OrderDiscount[];
}
export interface OrdersPage {
	orders: OrderRow[];
	total: number;
}
export interface OrdersQuery {
	from: string;
	to: string;
	status?: string;
	limit?: number;
	offset?: number;
}

export function ordersQS(q: OrdersQuery): string {
	const p = new URLSearchParams();
	p.set('from', q.from);
	p.set('to', q.to);
	if (q.status) p.set('status', q.status);
	if (q.limit != null) p.set('limit', String(q.limit));
	if (q.offset != null) p.set('offset', String(q.offset));
	return p.toString();
}

async function j<T>(res: Response): Promise<T> {
	const b = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(b?.error || `HTTP ${res.status}`);
	return b.data as T;
}

export const listOrders = (q: OrdersQuery) =>
	fetch(`/api/reports/orders?${ordersQS(q)}`).then((r) => j<OrdersPage>(r));

const EXPORT_PAGE = 200;

// listAllOrders fetches every order matching the filter by paging the endpoint
// (which caps limit at 200) until it has `total` rows. Stops if a page returns
// empty, so a bad total can't spin forever.
export async function listAllOrders(q: Omit<OrdersQuery, 'limit' | 'offset'>): Promise<OrderRow[]> {
	const all: OrderRow[] = [];
	let offset = 0;
	for (;;) {
		const page = await listOrders({ ...q, limit: EXPORT_PAGE, offset });
		all.push(...page.orders);
		offset += page.orders.length;
		if (page.orders.length === 0 || all.length >= page.total) break;
	}
	return all;
}
