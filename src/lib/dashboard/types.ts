export interface PeriodStats {
	revenue: number;
	gross: number;
	discount: number;
	subsidy: number;
	net_sales: number;
	customers_paid: number;
	orders: number;
	items: number;
	avg_ticket: number;
	items_per_order: number;
}
export interface CompareResult {
	current: PeriodStats;
	previous: PeriodStats;
}
export interface DayPoint {
	day: string;
	revenue: number;
	orders: number;
	items: number;
}
export interface HeatmapCell {
	dow: number;
	hour: number;
	revenue: number;
	orders: number;
}
export interface TopMenu {
	name: string;
	qty_sold: number;
	revenue: number;
}
export interface SubsidyProgram {
	name: string;
	amount: number;
}
