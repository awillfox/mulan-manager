<script lang="ts">
	import BottomTabBar from '$lib/components/ios/BottomTabBar.svelte';
	import ToastHost from '$lib/components/ios/ToastHost.svelte';
	let { children } = $props();

	const tabs = [
		{ href: '/', label: 'Dashboard', icon: '📊' },
		{ href: '/discounts', label: 'Discounts', icon: '🏷️' }
	];
</script>

<div class="flex min-h-screen flex-col bg-[var(--ios-grouped-bg)]">
	<main class="flex-1">{@render children?.()}</main>
	<BottomTabBar {tabs} />
</div>
<ToastHost />
