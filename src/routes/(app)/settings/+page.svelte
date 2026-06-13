<script lang="ts">
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Card from '$lib/components/ios/Card.svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import TextField from '$lib/components/ios/TextField.svelte';
	import Spinner from '$lib/components/ios/Spinner.svelte';
	import LogoUpload from '$lib/components/ios/LogoUpload.svelte';
	import { showToast } from '$lib/components/ios/toast.svelte';
	import {
		getSettings,
		updateSettings,
		uploadLogo,
		deleteLogo,
		type Settings
	} from '$lib/api/settings';

	let s = $state<Settings | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let logoVersion = $state(0);
	// string-bound inputs for numeric fields
	let vat = $state('');
	let ppb = $state('');

	async function load() {
		loading = true;
		try {
			s = await getSettings();
			vat = String(s.vat_percent);
			ppb = String(s.points_per_baht);
		} catch (e) {
			showToast((e as Error).message, 'error');
		} finally {
			loading = false;
		}
	}
	async function save() {
		if (!s) return;
		const vatN = parseFloat(vat),
			ppbN = parseFloat(ppb);
		if (!s.shop_name.trim()) return showToast('Shop name is required', 'error');
		if (Number.isNaN(vatN) || vatN < 0 || vatN > 100) return showToast('VAT must be 0–100', 'error');
		if (Number.isNaN(ppbN) || ppbN < 0) return showToast('Points/baht must be ≥ 0', 'error');
		saving = true;
		try {
			await updateSettings({ ...s, vat_percent: vatN, points_per_baht: ppbN });
			showToast('Saved');
		} catch (e) {
			const m = (e as Error).message;
			showToast(m.includes('403') ? 'Owner only' : m, 'error');
		} finally {
			saving = false;
		}
	}
	async function onpick(file: File) {
		try {
			await uploadLogo(file);
			logoVersion++;
			showToast('Logo updated');
		} catch (e) {
			const m = (e as Error).message;
			showToast(m.includes('403') ? 'Owner only' : m, 'error');
		}
	}
	async function onremove() {
		try {
			await deleteLogo();
			logoVersion++;
			showToast('Logo removed');
		} catch (e) {
			const m = (e as Error).message;
			showToast(m.includes('403') ? 'Owner only' : m, 'error');
		}
	}
	$effect(() => {
		load();
	});
</script>

<NavBar title="Settings" />

<div class="space-y-5 px-4 pt-2 pb-6">
	{#if loading || !s}
		<Spinner />
	{:else}
		<Card><LogoUpload version={logoVersion} {onpick} {onremove} /></Card>
		<div class="space-y-4">
			<TextField label="Shop name" bind:value={s.shop_name} placeholder="My Shop" />
			<TextField label="VAT %" bind:value={vat} inputmode="decimal" placeholder="7" />
			<TextField label="Points per ฿" bind:value={ppb} inputmode="decimal" placeholder="1" />
			<TextField label="Receipt footer" bind:value={s.receipt_footer} placeholder="Thank you!" />
		</div>
		<Button onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
	{/if}
</div>
