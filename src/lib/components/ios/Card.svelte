<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children, padded = true }: { children: Snippet; padded?: boolean } = $props();
</script>

<div class="overflow-hidden rounded-2xl bg-[var(--ios-card)] {padded ? 'p-4' : ''}">
	{@render children()}
</div>
