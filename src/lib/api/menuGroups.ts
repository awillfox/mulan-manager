import type { SelectionMode } from './optionGroups';
import type { SetGroupsBody } from './menus';

export type OptionRow = { id?: number; name: string; delta: string };

export type GroupEntry =
	| { kind: 'shared'; sourceId: number; name: string; selection_mode: SelectionMode; options: OptionRow[] }
	| { kind: 'isolated'; sourceId?: number; name: string; selection_mode: SelectionMode; options: OptionRow[] };

export function serializeMenuGroups(entries: GroupEntry[]): SetGroupsBody {
	return {
		groups: entries.map((e) =>
			e.kind === 'shared'
				? { isolated: false as const, id: e.sourceId }
				: {
						isolated: true as const,
						name: e.name.trim(),
						selection_mode: e.selection_mode,
						options: e.options
							.filter((o) => o.name.trim())
							.map((o) => ({ name: o.name.trim(), price_delta: parseFloat(o.delta) || 0 }))
					}
		)
	};
}
