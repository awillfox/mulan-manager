<script lang="ts">
	import { toasts } from './toast.svelte';
</script>

<div class="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
	{#each toasts as t (t.id)}
		<div
			class="pointer-events-auto rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg {t.kind ===
			'error'
				? 'bg-[var(--ios-red)]'
				: 'bg-black/80'}"
		>
			{t.message}
		</div>
	{/each}
</div>
