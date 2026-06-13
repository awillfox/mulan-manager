type Toast = { id: number; message: string; kind: 'info' | 'error' };
let nextId = 0;
export const toasts = $state<Toast[]>([]);

export function showToast(message: string, kind: 'info' | 'error' = 'info') {
	const id = nextId++;
	toasts.push({ id, message, kind });
	setTimeout(() => {
		const i = toasts.findIndex((t) => t.id === id);
		if (i >= 0) toasts.splice(i, 1);
	}, 2500);
}
