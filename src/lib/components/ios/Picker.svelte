<script lang="ts">
	import { fade, fly } from 'svelte/transition';

	type Option = { label: string; value: string | number | null };
	let {
		open = $bindable(false),
		title = 'Select',
		options,
		value = $bindable(),
		onselect
	}: {
		open?: boolean;
		title?: string;
		options: Option[];
		value?: string | number | null;
		onselect?: (v: string | number | null) => void;
	} = $props();

	function pick(v: string | number | null) {
		value = v;
		onselect?.(v);
		open = false;
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (open && e.key === 'Escape') open = false;
	}}
/>

{#if open}
	<div class="fixed inset-0 z-50">
		<button
			type="button"
			aria-label="Close"
			class="absolute inset-0 bg-black/40"
			onclick={() => (open = false)}
			transition:fade={{ duration: 200 }}
		></button>
		<div
			class="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-[20px] bg-[var(--ios-grouped-bg)] pb-[env(safe-area-inset-bottom)]"
			transition:fly={{ y: 500, duration: 300 }}
			role="dialog"
			aria-modal="true"
		>
			<div class="sticky top-0 flex items-center justify-center pt-2 pb-1">
				<div class="h-1.5 w-9 rounded-full bg-[var(--ios-label-tertiary)]"></div>
			</div>
			<p class="px-5 pb-2 text-xl font-bold text-[var(--ios-label)]">{title}</p>
			<div class="px-4 pb-4">
				{#each options as opt (String(opt.value))}
					<button
						type="button"
						onclick={() => pick(opt.value)}
						class="flex min-h-11 w-full items-center justify-between border-b border-[var(--ios-separator)] px-2 py-3 text-left last:border-0"
					>
						<span class="text-[var(--ios-label)]">{opt.label}</span>
						{#if value === opt.value}<span class="text-[var(--ios-blue)]">✓</span>{/if}
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}
