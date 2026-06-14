export function baht(n: number): string {
	return (
		'฿' +
		(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
	);
}
