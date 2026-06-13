import { describe, it, expect } from 'vitest';
import { serializeMenuGroups, type GroupEntry } from './menuGroups';

describe('serializeMenuGroups', () => {
	it('serializes a shared entry by id only', () => {
		const entries: GroupEntry[] = [
			{ kind: 'shared', sourceId: 5, name: 'Sweetness', selection_mode: 'single_required', options: [] }
		];
		expect(serializeMenuGroups(entries)).toEqual({ groups: [{ isolated: false, id: 5 }] });
	});
	it('serializes an isolated entry with options, dropping empty names and parsing deltas', () => {
		const entries: GroupEntry[] = [
			{
				kind: 'isolated',
				name: 'Custom',
				selection_mode: 'multi',
				options: [
					{ name: 'A', delta: '2.5' },
					{ name: '', delta: '9' },
					{ name: 'B', delta: '' }
				]
			}
		];
		expect(serializeMenuGroups(entries)).toEqual({
			groups: [
				{
					isolated: true,
					name: 'Custom',
					selection_mode: 'multi',
					options: [
						{ name: 'A', price_delta: 2.5 },
						{ name: 'B', price_delta: 0 }
					]
				}
			]
		});
	});
});
