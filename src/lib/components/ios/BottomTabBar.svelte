<script lang="ts">
	import { page } from '$app/state';
	let {
		tabs
	}: { tabs: { href: string; label: string; icon: string }[] } = $props();
</script>

<nav
	class="sticky bottom-0 z-30 flex border-t border-[var(--ios-separator)] bg-[var(--ios-nav-blur)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
	style="-webkit-backdrop-filter: blur(20px)"
>
	{#each tabs as tab (tab.href)}
		{@const active = page.url.pathname === tab.href}
		<a
			href={tab.href}
			class="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium {active
				? 'text-[var(--ios-blue)]'
				: 'text-[var(--ios-label-secondary)]'}"
		>
			<span class="text-xl leading-none">{tab.icon}</span>
			{tab.label}
		</a>
	{/each}
</nav>
