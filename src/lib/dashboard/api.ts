import type { Range } from './range';
import type { CompareResult, DayPoint, HeatmapCell, TopMenu, SubsidyProgram } from './types';

async function get<T>(path: string): Promise<T> {
	const res = await fetch(path);
	if (!res.ok) throw new Error(`${path} -> ${res.status}`);
	const body = await res.json();
	return body.data as T;
}

export interface DashboardData {
	compare: CompareResult;
	salesByDay: DayPoint[];
	heatmap: HeatmapCell[];
	topMenus: TopMenu[];
	allItems: TopMenu[];
	subsidies: SubsidyProgram[];
}

export async function loadDashboard(range: Range): Promise<DashboardData> {
	const qs = `from=${range.from}&to=${range.to}`;
	const [compare, salesByDay, heatmap, topMenus, allItems, subsidies] = await Promise.all([
		get<CompareResult>(`/api/dashboard/compare?${qs}`),
		get<DayPoint[]>(`/api/dashboard/sales-by-day?${qs}`),
		get<HeatmapCell[]>(`/api/dashboard/heatmap?${qs}`),
		get<TopMenu[]>(`/api/dashboard/top-menus?${qs}`),
		get<TopMenu[]>(`/api/dashboard/menu-items?${qs}`),
		get<SubsidyProgram[]>(`/api/dashboard/subsidies?${qs}`)
	]);
	return { compare, salesByDay, heatmap, topMenus, allItems, subsidies };
}
