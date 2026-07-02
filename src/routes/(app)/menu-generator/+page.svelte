<script lang="ts">
	import { onMount } from 'svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Card from '$lib/components/ios/Card.svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import TextField from '$lib/components/ios/TextField.svelte';
	import Spinner from '$lib/components/ios/Spinner.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import { showToast } from '$lib/components/ios/toast.svelte';
	import { listMenus, type Menu } from '$lib/api/menus';
	import { listCategories, type Category } from '$lib/api/categories';
	import { getSettings } from '$lib/api/settings';
	import { buildMenuSheet, type Branding } from '$lib/menu-pdf/model';
	import { buildDocDefinition, generatePdf } from '$lib/menu-pdf/pdf';

	let loading = $state(true);
	let err = $state('');
	let menus = $state<Menu[]>([]);
	let categories = $state<Category[]>([]);

	let brand = $state<Branding>({
		title: '',
		tagline: 'Since 2016',
		subtitle: '',
		hours: 'Open daily · 8am – 6pm',
		footer: 'All prices in Thai Baht (฿)'
	});

	let previewUrl = $state('');
	let generating = $state(false);
	let blob = $state<Blob | null>(null);

	onMount(async () => {
		try {
			const [m, c, s] = await Promise.all([listMenus(), listCategories(), getSettings()]);
			menus = m;
			categories = c;
			brand.title = s.shop_name || 'Menu';
		} catch (e) {
			err = (e as Error).message;
		} finally {
			loading = false;
		}
	});

	const sheet = $derived(buildMenuSheet(menus, categories));
	const hasItems = $derived(sheet.sections.length > 0);

	// Regenerate the preview (debounced) whenever the data or branding changes.
	$effect(() => {
		const doc = buildDocDefinition(sheet, { ...brand });
		if (!hasItems) return;
		generating = true;
		const timer = setTimeout(async () => {
			try {
				const out = await generatePdf(doc);
				previewUrl = out.dataUrl;
				blob = out.blob;
			} catch (e) {
				showToast((e as Error).message, 'error');
			} finally {
				generating = false;
			}
		}, 400);
		return () => clearTimeout(timer);
	});

	function download() {
		if (!blob) return;
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'menu.pdf';
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<NavBar title="Menu Generator" />

<div class="space-y-6 px-4 pt-2 pb-6">
	{#if loading}
		<div class="flex justify-center py-16"><Spinner /></div>
	{:else if err}
		<EmptyState title="Couldn't load menus" subtitle={err} />
	{:else if !hasItems}
		<EmptyState title="No active menu items" subtitle="Add active items to generate a menu." />
	{:else}
		<div>
			<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">Branding</p>
			<Card>
				<div class="space-y-4">
					<TextField label="Title" bind:value={brand.title} placeholder="TH Gallery & Café" />
					<TextField label="Tagline" bind:value={brand.tagline} placeholder="Since 2016" />
					<TextField label="Subtitle" bind:value={brand.subtitle} placeholder="Gallery & Café" />
					<TextField label="Hours" bind:value={brand.hours} placeholder="Open daily · 8am – 6pm" />
					<TextField
						label="Footer note"
						bind:value={brand.footer}
						placeholder="All prices in Thai Baht (฿)"
					/>
				</div>
			</Card>
		</div>

		<div>
			<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">Preview</p>
			<Card padded={false}>
				<div class="relative">
					{#if previewUrl}
						<iframe title="Menu preview" src={previewUrl} class="h-[70vh] w-full rounded-xl"
						></iframe>
					{:else}
						<div class="flex h-[70vh] items-center justify-center"><Spinner /></div>
					{/if}
					{#if generating && previewUrl}
						<div class="absolute right-3 top-3"><Spinner /></div>
					{/if}
				</div>
			</Card>
		</div>

		<Button onclick={download} disabled={!blob || generating}>
			{generating ? 'Generating…' : 'Download PDF'}
		</Button>
	{/if}
</div>
