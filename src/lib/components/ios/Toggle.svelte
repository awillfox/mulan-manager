<script lang="ts">
	let {
		checked = $bindable(false),
		label
	}: { checked?: boolean; label?: string } = $props();
</script>

<label class="flex items-center justify-between gap-3">
	{#if label}<span class="text-[var(--ios-label)]">{label}</span>{/if}
	<button
		type="button"
		role="switch"
		aria-checked={checked}
		aria-label={label}
		onclick={() => (checked = !checked)}
		class="relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 {checked
			? 'bg-[var(--ios-green)]'
			: 'bg-[var(--ios-fill)]'}"
		style="transition-timing-function: var(--ios-ease)"
	>
		<span
			class="absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-transform duration-200 {checked
				? 'translate-x-[20px]'
				: ''}"
			style="transition-timing-function: var(--ios-ease)"
		></span>
	</button>
</label>
