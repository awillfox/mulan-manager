<script lang="ts">
	let {
		options,
		value = $bindable()
	}: { options: { label: string; value: string }[]; value?: string } = $props();
</script>

<div class="flex gap-1 rounded-xl bg-[var(--ios-fill)] p-1" role="tablist">
	{#each options as opt (opt.value)}
		<button
			type="button"
			role="tab"
			aria-selected={value === opt.value}
			onclick={() => (value = opt.value)}
			class="h-9 flex-1 rounded-lg text-sm font-medium transition duration-200 {value === opt.value
				? 'bg-[var(--ios-card)] text-[var(--ios-label)] shadow'
				: 'text-[var(--ios-label-secondary)]'}"
			style="transition-timing-function: var(--ios-ease)"
		>
			{opt.label}
		</button>
	{/each}
</div>
