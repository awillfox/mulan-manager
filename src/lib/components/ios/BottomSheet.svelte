<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	let {
		open = $bindable(false),
		title,
		children
	}: { open?: boolean; title?: string; children: Snippet } = $props();

	function close() {
		open = false;
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (open && e.key === 'Escape') close();
	}}
/>

{#if open}
	<div class="fixed inset-0 z-40">
		<button
			type="button"
			aria-label="Close"
			class="absolute inset-0 bg-black/40"
			onclick={close}
			transition:fade={{ duration: 200 }}
		></button>
		<div
			class="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto rounded-t-[20px] bg-[var(--ios-grouped-bg)] pb-[env(safe-area-inset-bottom)]"
			transition:fly={{ y: 600, duration: 300, opacity: 1 }}
			role="dialog"
			aria-modal="true"
		>
			<div class="sticky top-0 flex items-center justify-center pt-2 pb-1">
				<div class="h-1.5 w-9 rounded-full bg-[var(--ios-label-tertiary)]"></div>
			</div>
			{#if title}
				<div class="px-5 pb-2">
					<h2 class="text-xl font-bold text-[var(--ios-label)]">{title}</h2>
				</div>
			{/if}
			<div class="px-5 pt-1">{@render children()}</div>
		</div>
	</div>
{/if}
