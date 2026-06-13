<script lang="ts">
	import type { Snippet } from 'svelte';
	let { title, trailing }: { title: string; trailing?: Snippet } = $props();
</script>

<header
	class="sticky top-0 z-30 bg-[var(--ios-nav-blur)] px-4 pt-3 pb-2 backdrop-blur-xl"
	style="-webkit-backdrop-filter: blur(20px)"
>
	<div class="flex items-end justify-between">
		<h1 class="text-[34px] leading-tight font-bold tracking-tight text-[var(--ios-label)]">
			{title}
		</h1>
		{#if trailing}<div class="pb-2">{@render trailing()}</div>{/if}
	</div>
</header>
