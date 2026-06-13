<script lang="ts">
	let {
		value = $bindable(''),
		placeholder = '',
		type = 'text',
		inputmode,
		label
	}: {
		value?: string;
		placeholder?: string;
		type?: string;
		inputmode?: 'text' | 'numeric' | 'decimal';
		label?: string;
	} = $props();
</script>

<label class="block">
	{#if label}
		<span class="mb-1 block text-sm text-[var(--ios-label-secondary)]">{label}</span>
	{/if}
	<input
		{type}
		{inputmode}
		{placeholder}
		bind:value
		class="h-11 w-full rounded-xl bg-[var(--ios-fill)] px-4 text-[var(--ios-label)] outline-none focus:ring-2 focus:ring-[var(--ios-blue)]"
	/>
</label>
