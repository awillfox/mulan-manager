<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		onclick,
		divider = true,
		children,
		trailing
	}: {
		onclick?: () => void;
		divider?: boolean;
		children: Snippet;
		trailing?: Snippet;
	} = $props();
</script>

<!-- tabindex is only set when onclick makes the row an interactive role="button" -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	role={onclick ? 'button' : undefined}
	tabindex={onclick ? 0 : undefined}
	{onclick}
	onkeydown={(e) => {
		if (onclick && (e.key === 'Enter' || e.key === ' ')) {
			e.preventDefault();
			onclick();
		}
	}}
	class="flex min-h-11 items-center justify-between gap-3 bg-[var(--ios-card)] px-4 py-3 {onclick
		? 'cursor-pointer active:bg-[var(--ios-fill)]'
		: ''} {divider ? 'border-b border-[var(--ios-separator)]' : ''}"
>
	<div class="min-w-0 flex-1">{@render children()}</div>
	{#if trailing}<div class="shrink-0">{@render trailing()}</div>{/if}
</div>
