<script lang="ts">
	import Button from './Button.svelte';
	let {
		logoUrl = '/api/settings/logo',
		version = 0,
		onpick,
		onremove
	}: {
		logoUrl?: string;
		version?: number;
		onpick?: (file: File) => void;
		onremove?: () => void;
	} = $props();

	let fileInput = $state<HTMLInputElement | null>(null);
	let failed = $state(false);

	function choose() {
		fileInput?.click();
	}
	function onchange(e: Event) {
		const f = (e.target as HTMLInputElement).files?.[0];
		if (f) onpick?.(f);
	}
</script>

<div class="flex items-center gap-4">
	<div
		class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-[var(--ios-fill)]"
	>
		{#if failed}
			<span class="text-xs text-[var(--ios-label-tertiary)]">No logo</span>
		{:else}
			<img
				src={`${logoUrl}?v=${version}`}
				alt="Shop logo"
				class="h-full w-full object-contain"
				onerror={() => (failed = true)}
			/>
		{/if}
	</div>
	<div class="flex gap-2">
		<Button variant="tinted" onclick={choose}>Upload</Button>
		<Button variant="plain" onclick={() => onremove?.()}>Remove</Button>
	</div>
	<input
		bind:this={fileInput}
		type="file"
		accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
		class="hidden"
		onchange={onchange}
	/>
</div>
