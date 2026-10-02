import { describe, it, expect } from 'vitest';
import { buildVoidReq, reasonValid, breakdownLines } from './voids';

describe('buildVoidReq', () => {
	it('whole order ignores quantities', () => {
		expect(buildVoidReq(true, { 1: 2 }, 'duplicate', '')).toEqual({
			scope: 'order',
			reason_code: 'duplicate',
			reason_text: ''
		});
	});
	it('items keeps only positive quantities', () => {
		expect(buildVoidReq(false, { 1: 1, 2: 0, 3: 2 }, 'other', ' x ')).toEqual({
			scope: 'items',
			items: [
				{ order_item_id: 1, qty: 1 },
				{ order_item_id: 3, qty: 2 }
			],
			reason_code: 'other',
			reason_text: 'x'
		});
	});
});

describe('reasonValid', () => {
	it('needs a code', () => expect(reasonValid('', '')).toBe(false));
	it('preset ok', () => expect(reasonValid('wrong_item', '')).toBe(true));
	it('other needs text', () => {
		expect(reasonValid('other', '   ')).toBe(false);
		expect(reasonValid('other', 'ลูกค้าเปลี่ยนใจ')).toBe(true);
	});
	it('max 500 chars', () => expect(reasonValid('other', 'ก'.repeat(501))).toBe(false));
});

describe('breakdownLines', () => {
	it('lists bills/coins largest first in baht', () => {
		expect(breakdownLines({ '500': 1, '10000': 1, '2000': 2 })).toEqual(['฿100 × 1', '฿20 × 2', '฿5 × 1']);
	});
	it('empty for no breakdown', () => expect(breakdownLines({})).toEqual([]));
});
