// Browser test (chromium project): generatePdf must actually render a PDF using
// the embedded Sarabun font registered into pdfmake's virtual file system.
// Regression guard for the pdfmake 0.3 VFS API (addVirtualFileSystem, not `.vfs =`).
import { describe, it, expect } from 'vitest';
import { buildDocDefinition, generatePdf } from './pdf';
import type { Branding, MenuSheet } from './model';

const brand: Branding = {
	title: 'TH Gallery & Café',
	tagline: 'Since 2016',
	subtitle: 'Gallery & Café',
	hours: 'Open daily · 8am – 6pm',
	footer: 'All prices in Thai Baht (฿)',
	background: '#f3ead8'
};

const sheet: MenuSheet = {
	sections: [
		{
			title: 'Coffee',
			columns: ['Hot', 'Iced'],
			rows: [{ id: 1, name: 'Americano', prices: [75, 85], single: null }]
		},
		{
			title: 'Food',
			columns: [],
			rows: [{ id: 2, name: 'Pancake', prices: [], single: 80 }]
		}
	]
};

describe('generatePdf (browser)', () => {
	it('renders a PDF blob using the embedded Sarabun font', async () => {
		const doc = buildDocDefinition(sheet, brand);
		const { dataUrl, blob } = await generatePdf(doc);
		expect(blob.type).toBe('application/pdf');
		expect(blob.size).toBeGreaterThan(1000);
		expect(dataUrl.startsWith('data:application/pdf;base64,')).toBe(true);
	}, 30000);
});
