import {
	Chart,
	LineController,
	LineElement,
	PointElement,
	LinearScale,
	CategoryScale,
	DoughnutController,
	ArcElement,
	Tooltip,
	Filler,
	Legend
} from 'chart.js';

let registered = false;

/** Register only the controllers we use; safe to call repeatedly. */
export function ensureChart(): typeof Chart {
	if (!registered) {
		Chart.register(
			LineController,
			LineElement,
			PointElement,
			LinearScale,
			CategoryScale,
			DoughnutController,
			ArcElement,
			Tooltip,
			Filler,
			Legend
		);
		registered = true;
	}
	return Chart;
}

export const PALETTE = [
	'#0a84ff',
	'#30d158',
	'#ff9f0a',
	'#ff375f',
	'#bf5af2',
	'#64d2ff',
	'#ffd60a'
];
