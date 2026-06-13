<script lang="ts">
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Card from '$lib/components/ios/Card.svelte';

	const groups = [
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
				{ href: '/settings', label: 'Settings', icon: '⚙' }
			]
		}
	];
</script>

<NavBar title="More" />

<div class="space-y-6 px-4 pt-2 pb-6">
	{#each groups as group (group.title)}
		<div>
			<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">{group.title}</p>
			<Card padded={false}>
				{#each group.items as item, i (item.href)}
					<a
						href={item.href}
						class="flex min-h-11 items-center justify-between px-4 py-3 active:bg-[var(--ios-fill)] {i <
						group.items.length - 1
							? 'border-b border-[var(--ios-separator)]'
							: ''}"
					>
						<span class="flex items-center gap-3 text-[var(--ios-label)]">
							<span class="text-lg">{item.icon}</span>{item.label}
						</span>
						<span class="text-[var(--ios-label-tertiary)]">›</span>
					</a>
				{/each}
			</Card>
		</div>
	{/each}
</div>
