<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		variant = 'filled',
		type = 'button',
		disabled = false,
		onclick,
		children
	}: {
		variant?: 'filled' | 'tinted' | 'plain' | 'destructive';
		type?: 'button' | 'submit';
		disabled?: boolean;
		onclick?: () => void;
		children: Snippet;
	} = $props();

	const styles = {
		filled: 'bg-[var(--ios-blue)] text-white',
		tinted: 'bg-[var(--ios-fill)] text-[var(--ios-blue)]',
		plain: 'text-[var(--ios-blue)]',
		destructive: 'bg-[var(--ios-red)] text-white'
	};
</script>

<button
	{type}
	{disabled}
	{onclick}
	class="flex h-11 min-w-11 items-center justify-center rounded-xl px-5 font-semibold transition duration-200 active:scale-[0.97] disabled:opacity-40 {styles[
		variant
	]}"
	style="transition-timing-function: var(--ios-ease)"
>
	{@render children()}
</button>
