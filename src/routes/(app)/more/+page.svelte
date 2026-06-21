<script lang="ts">
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Card from '$lib/components/ios/Card.svelte';
	import BottomSheet from '$lib/components/ios/BottomSheet.svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import TextField from '$lib/components/ios/TextField.svelte';
	import { showToast } from '$lib/components/ios/toast.svelte';
	import { changePassword } from '$lib/api/account';

	const groups = [
		{
			title: 'Catalog',
			items: [
				{ href: '/orders', label: 'Orders', icon: '🧾' },
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
					href: 'https://bookyman-remote.onrender.com/',
					label: 'Music Player',
					icon: '🎵',
					external: true
				}
			]
		}
	];

	let pwOpen = $state(false);
	let current = $state('');
	let next = $state('');
	let confirm = $state('');
	let saving = $state(false);

	function openPw() {
		current = '';
		next = '';
		confirm = '';
		pwOpen = true;
	}

	async function submitPw() {
		if (!current) return showToast('Enter your current password', 'error');
		if (next.length < 8) return showToast('New password must be at least 8 characters', 'error');
		if (next !== confirm) return showToast('New passwords do not match', 'error');
		saving = true;
		try {
			await changePassword(current, next);
			pwOpen = false;
			showToast('Password changed');
		} catch (e) {
			showToast((e as Error).message, 'error');
		} finally {
			saving = false;
		}
	}
</script>

<NavBar title="More" />

<div class="space-y-6 px-4 pt-2 pb-6">
	<!-- Account -->
	<div>
		<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">Account</p>
		<Card padded={false}>
			<button
				type="button"
				onclick={openPw}
				class="flex min-h-11 w-full items-center justify-between border-b border-[var(--ios-separator)] px-4 py-3 active:bg-[var(--ios-fill)]"
			>
				<span class="flex items-center gap-3 text-[var(--ios-label)]">
					<span class="text-lg">🔑</span>Change Password
				</span>
				<span class="text-[var(--ios-label-tertiary)]">›</span>
			</button>
			<form method="POST" action="/logout">
				<button
					type="submit"
					class="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left text-[var(--ios-red)] active:bg-[var(--ios-fill)]"
				>
					<span class="text-lg">⏻</span>Sign Out
				</button>
			</form>
		</Card>
	</div>

	{#each groups as group (group.title)}
		<div>
			<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">{group.title}</p>
			<Card padded={false}>
				{#each group.items as item, i (item.href)}
					<a
						href={item.href}
						rel={item.external ? 'noreferrer' : undefined}
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

<BottomSheet bind:open={pwOpen} title="Change Password">
	<div class="space-y-4 pb-6">
		<TextField
			label="Current password"
			bind:value={current}
			type="password"
			placeholder="••••••••"
		/>
		<TextField
			label="New password (min 8)"
			bind:value={next}
			type="password"
			placeholder="••••••••"
		/>
		<TextField
			label="Confirm new password"
			bind:value={confirm}
			type="password"
			placeholder="••••••••"
		/>
		<Button onclick={submitPw} disabled={saving}>{saving ? 'Saving…' : 'Change Password'}</Button>
	</div>
</BottomSheet>
