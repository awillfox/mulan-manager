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
	import { buildDocDefinition, generatePdf, formatBaht } from '$lib/menu-pdf/pdf';
	import {
		partialRows,
		applyOverrides,
		movePrice,
		type Overrides,
		type PartialRow
	} from '$lib/menu-pdf/overrides';

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
	let runToken = 0;

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

	// Generator-only reassignment of partially-filled variant prices between the
	// shared Hot/Iced/Frappé columns (never touches the backend).
	let overrides = $state<Overrides>({});
	const effectiveSheet = $derived(applyOverrides(sheet, overrides));
	const partials = $derived(partialRows(sheet));

	function move(key: string, base: (number | null)[], from: number, to: number) {
		overrides = { ...overrides, [key]: movePrice(overrides[key] ?? base, from, to) };
	}

	// Place a flat-priced item's single price into a chosen column.
	function place(p: PartialRow, col: number, value: number) {
		const arr: (number | null)[] = p.columns.map(() => null);
		arr[col] = value;
		overrides = { ...overrides, [p.key]: arr };
	}

	// Drop the override for a row (back to its original placement / flat price).
	function clearRow(key: string) {
		const next = { ...overrides };
		delete next[key];
		overrides = next;
	}

	// Regenerate the preview (debounced) whenever the data, branding, or overrides change.
	$effect(() => {
		if (!hasItems) return;
		const doc = buildDocDefinition(effectiveSheet, { ...brand });
		generating = true;
		const timer = setTimeout(async () => {
			const myToken = ++runToken;
			try {
				const out = await generatePdf(doc);
				if (myToken !== runToken) return;
				previewUrl = out.dataUrl;
				blob = out.blob;
			} catch (e) {
				if (myToken !== runToken) return;
				showToast((e as Error).message, 'error');
			} finally {
				if (myToken === runToken) generating = false;
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

		{#if partials.length > 0}
			<div>
				<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">
					Adjust variant columns
				</p>
				<Card padded={false}>
					<p class="px-3 pt-3 text-xs text-[var(--ios-label-tertiary)]">
						These items don't fill every column. Use ‹ › to move a price between empty slots, or tap
						a faint price to place a flat item into a column.
					</p>
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="text-[var(--ios-label-tertiary)]">
									<th class="px-3 py-2 text-left font-medium">Item</th>
									{#each partials[0].columns as c (c)}
										<th class="px-2 py-2 text-center font-medium">{c.toUpperCase()}</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each partials as p (p.key)}
									{@const cur = overrides[p.key] ?? p.prices}
									{@const single = p.single}
									{@const unplaced = single != null && cur.every((x) => x == null)}
									{@const hasOverride = p.key in overrides}
									<tr class="border-t border-[var(--ios-separator)]">
										<td class="px-3 py-2 text-[var(--ios-label)]">
											{p.name}
											<span class="block text-xs text-[var(--ios-label-tertiary)]">
												{p.sectionTitle}{#if hasOverride}
													· <button
														type="button"
														class="text-[var(--ios-blue)]"
														onclick={() => clearRow(p.key)}>Reset</button
													>{/if}
											</span>
										</td>
										{#each p.columns as col, ci (col)}
											{@const v = cur[ci]}
											<td class="px-2 py-2 text-center">
												{#if v != null}
													<div class="flex items-center justify-center gap-0.5">
														{#if ci > 0 && cur[ci - 1] == null}
															<button
																type="button"
																class="flex h-7 w-7 items-center justify-center rounded-full text-lg text-[var(--ios-blue)] active:bg-[var(--ios-fill)]"
																aria-label={`Move ${p.name} ${col} price left`}
																onclick={() => move(p.key, p.prices, ci, ci - 1)}>‹</button
															>
														{/if}
														<span class="tabular-nums text-[var(--ios-label)]">{formatBaht(v)}</span
														>
														{#if ci < p.columns.length - 1 && cur[ci + 1] == null}
															<button
																type="button"
																class="flex h-7 w-7 items-center justify-center rounded-full text-lg text-[var(--ios-blue)] active:bg-[var(--ios-fill)]"
																aria-label={`Move ${p.name} ${col} price right`}
																onclick={() => move(p.key, p.prices, ci, ci + 1)}>›</button
															>
														{/if}
													</div>
												{:else if unplaced && single != null}
													<button
														type="button"
														class="rounded px-1.5 py-1 text-xs text-[var(--ios-label-tertiary)] underline decoration-dotted active:bg-[var(--ios-fill)]"
														aria-label={`Place ${p.name} price in ${col}`}
														onclick={() => place(p, ci, single)}>{formatBaht(single)}</button
													>
												{:else}
													<span class="text-[var(--ios-label-tertiary)]">·</span>
												{/if}
											</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</Card>
			</div>
		{/if}

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
