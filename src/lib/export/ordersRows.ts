import type { OrderRow } from '$lib/api/reports';

export interface ExportRow {
	date: Date;
	code: string;
	status: string;
	member: string;
	phone: string;
	points: number;
	items: number;
	gross: number;
	discount: number;
	subsidy: number;
	net: number;
}

export function ordersToRows(orders: OrderRow[]): ExportRow[] {
	return orders.map((o) => ({
		date: new Date(o.created_at),
		code: o.code,
		status: o.status,
		member: o.member_name,
		phone: o.member_phone,
		points: o.points_earned,
		items: o.qty,
		gross: o.gross,
		discount: o.discount,
		subsidy: o.subsidy,
		net: o.net
	}));
}
