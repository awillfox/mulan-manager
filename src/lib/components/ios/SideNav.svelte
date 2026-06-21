<script lang="ts">
	import { page } from '$app/state';

	const groups = [
		{
			title: '',
			items: [
				{ href: '/', label: 'Dashboard', icon: '📊' },
				{ href: '/menu', label: 'Menu', icon: '☕' },
				{ href: '/members', label: 'Members', icon: '👤' },
				{ href: '/orders', label: 'Orders', icon: '🧾' }
			]
		},
		{
			title: 'Catalog',
			items: [
				{ href: '/option-groups', label: 'Option Groups', icon: '⌥' },
				{ href: '/discounts', label: 'Discounts', icon: '％' }
			]
		},
		{
			title: 'Staff & Shop',
			items: [
				{ href: '/cashiers', label: 'Cashiers', icon: '⛁' },
				{ href: '/drawer', label: 'Cash Drawer', icon: '💵' },
				{ href: '/settings', label: 'Settings', icon: '⚙' },
				{
					href: 'https://bookyman-remote.onrender.com/login?key=changeme',
					label: 'Music Player',
					icon: '🎵',
					external: true
				}
			]
		}
	];
</script>

<nav
	class="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-[var(--ios-separator)] bg-[var(--ios-nav-blur)] px-3 py-5 backdrop-blur-xl md:flex"
	style="-webkit-backdrop-filter: blur(20px)"
>
	<p class="px-2 text-lg font-bold text-[var(--ios-label)]">Manager</p>
	{#each groups as group (group.title)}
		<div class="flex flex-col gap-0.5">
			{#if group.title}
				<p
					class="mb-1 px-2 text-xs font-medium tracking-wide text-[var(--ios-label-tertiary)] uppercase"
				>
					{group.title}
				</p>
			{/if}
			{#each group.items as item (item.href)}
				{@const active = page.url.pathname === item.href}
				<a
					href={item.href}
					rel={item.external ? 'noreferrer' : undefined}
					class="flex items-center gap-3 rounded-xl px-2 py-2 text-sm font-medium {active
						? 'bg-[var(--ios-fill)] text-[var(--ios-blue)]'
						: 'text-[var(--ios-label)]'}"
				>
					<span class="text-lg">{item.icon}</span>{item.label}
				</a>
			{/each}
		</div>
	{/each}
</nav>
