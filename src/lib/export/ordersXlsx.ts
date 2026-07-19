import type { OrderRow } from '$lib/api/reports';
import { ordersToRows, type ExportRow } from './ordersRows';

// exportOrdersXlsx builds the worksheet from order rows and triggers a browser
// download. write-excel-file is dynamic-imported so it never loads during SSR
// or in the initial bundle.
export async function exportOrdersXlsx(orders: OrderRow[], fileName: string): Promise<void> {
	const { default: writeXlsxFile } = await import('write-excel-file/browser');
	const rows = ordersToRows(orders);

	// write-excel-file v4 uses `columns` with `header`/`cell` (not the v3 `schema`/`value` style).
	// `cell` returns a cell object with `value`, `type`, and `format`.
	const columns = [
		{
			header: 'Created',
			width: 16,
			cell: (r: ExportRow) => ({ value: r.date, type: Date, format: 'dd/mm/yyyy hh:mm' })
		},
		{
			header: 'Paid at',
			width: 16,
			cell: (r: ExportRow) =>
				r.paidAt
					? { value: r.paidAt, type: Date, format: 'dd/mm/yyyy hh:mm' }
					: { value: null, type: Date }
		},
		{
			header: 'Code',
			width: 12,
			cell: (r: ExportRow) => ({ value: r.code, type: String })
		},
		{
			header: 'Status',
			width: 8,
			cell: (r: ExportRow) => ({ value: r.status, type: String })
		},
		{
			header: 'Member',
			width: 16,
			cell: (r: ExportRow) => ({ value: r.member, type: String })
		},
		{
			header: 'Phone',
			width: 14,
			cell: (r: ExportRow) => ({ value: r.phone, type: String })
		},
		{
			header: 'Points',
			width: 8,
			cell: (r: ExportRow) => ({ value: r.points, type: Number, format: '0' })
		},
		{
			header: 'Items',
			width: 6,
			cell: (r: ExportRow) => ({ value: r.items, type: Number, format: '0' })
		},
		{
			header: 'Gross',
			width: 12,
			cell: (r: ExportRow) => ({ value: r.gross, type: Number, format: '#,##0.00' })
		},
		{
			header: 'Discount',
			width: 12,
			cell: (r: ExportRow) => ({ value: r.discount, type: Number, format: '#,##0.00' })
		},
		{
			header: 'Subsidy',
			width: 12,
			cell: (r: ExportRow) => ({ value: r.subsidy, type: Number, format: '#,##0.00' })
		},
		{
			header: 'Net',
			width: 12,
			cell: (r: ExportRow) => ({ value: r.net, type: Number, format: '#,##0.00' })
		}
	];

	await writeXlsxFile(rows, { columns: columns as never }).toFile(fileName);
}
