<script lang="ts">
	let { value = $bindable(''), placeholder = 'Search' }: { value?: string; placeholder?: string } =
		$props();
</script>

<div class="flex h-9 items-center gap-2 rounded-xl bg-[var(--ios-fill)] px-3">
	<svg class="h-4 w-4 text-[var(--ios-label-secondary)]" viewBox="0 0 20 20" fill="currentColor">
		<path
			fill-rule="evenodd"
			d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.45 4.39l3.08 3.08a1 1 0 01-1.42 1.42l-3.08-3.08A7 7 0 012 9z"
			clip-rule="evenodd"
		/>
	</svg>
	<input
		{placeholder}
		bind:value
		class="h-full w-full bg-transparent text-[var(--ios-label)] outline-none"
	/>
</div>
