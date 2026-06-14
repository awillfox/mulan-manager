<script lang="ts">
	import BottomTabBar from '$lib/components/ios/BottomTabBar.svelte';
	import SideNav from '$lib/components/ios/SideNav.svelte';
	import ToastHost from '$lib/components/ios/ToastHost.svelte';
	let { children } = $props();

	const tabs = [
		{ href: '/', label: 'Dashboard', icon: '📊' },
		{ href: '/menu', label: 'Menu', icon: '☕' },
		{ href: '/members', label: 'Members', icon: '👤' },
		{ href: '/more', label: 'More', icon: '⋯' }
	];
</script>

<div class="flex min-h-screen bg-[var(--ios-grouped-bg)]">
	<SideNav />
	<div class="flex min-h-screen min-w-0 flex-1 flex-col">
		<main class="flex-1 md:mx-auto md:w-full md:max-w-5xl md:px-6">{@render children?.()}</main>
		<div class="md:hidden"><BottomTabBar {tabs} /></div>
	</div>
</div>
<ToastHost />
