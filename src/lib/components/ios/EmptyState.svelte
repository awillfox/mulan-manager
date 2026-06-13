<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		title,
		subtitle,
		action
	}: { title: string; subtitle?: string; action?: Snippet } = $props();
</script>

<div class="flex flex-col items-center justify-center px-8 py-16 text-center">
	<p class="text-lg font-semibold text-[var(--ios-label)]">{title}</p>
	{#if subtitle}<p class="mt-1 text-[var(--ios-label-secondary)]">{subtitle}</p>{/if}
	{#if action}<div class="mt-5">{@render action()}</div>{/if}
</div>
