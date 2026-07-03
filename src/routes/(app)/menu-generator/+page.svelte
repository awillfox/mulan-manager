<script lang="ts">
	import { onMount } from 'svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Card from '$lib/components/ios/Card.svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import TextField from '$lib/components/ios/TextField.svelte';
	import Spinner from '$lib/components/ios/Spinner.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import { showToast } from '$lib/components/ios/toast.svelte';
	import { dndzone } from 'svelte-dnd-action';
	import { listMenus, reorderMenus, type Menu } from '$lib/api/menus';
	import { listCategories, type Category } from '$lib/api/categories';
	import { getSettings } from '$lib/api/settings';
	import { buildMenuSheet, filterExcluded, type Branding } from '$lib/menu-pdf/model';
	import { buildDocDefinition, generatePdf, formatBaht, columnLabel } from '$lib/menu-pdf/pdf';
	import { buildMenuWorkbook } from '$lib/menu-pdf/xlsx';
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
		footer: 'All prices in Thai Baht (฿)',
		background: '#f3ead8'
	});

	let previewUrl = $state('');
	let generating = $state(false);
	let blob = $state<Blob | null>(null);
	let runToken = 0;
	let committing = $state(false);

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

	// Generator-only: menu ids hidden from the PDF (never sent to the backend,
	// not persisted). The Excel export deliberately ignores this.
	let excluded = $state<Set<number>>(new Set());
	function toggleExcluded(id: number) {
		const next = new Set(excluded);
		next.has(id) ? next.delete(id) : next.add(id);
		excluded = next;
	}
	const pdfSheet = $derived(filterExcluded(effectiveSheet, excluded));
	// Items exist, but every one is hidden from the PDF → nothing to render.
	const pdfEmpty = $derived(hasItems && pdfSheet.sections.length === 0);

	// Price/column cells for a row, looked up by menu id off the effective sheet.
	const rowById = $derived(
		new Map(
			effectiveSheet.sections.flatMap((s) =>
				s.rows.map((r) => [r.id, { columns: s.columns, row: r }] as const)
			)
		)
	);

	// Partial rows (need the ‹ ›/place price controls), looked up by menu id.
	const partialById = $derived(new Map(partials.map((p) => [p.key, p])));

	// One drag group per category (categories in order, then uncategorised),
	// each holding its menus sorted by (sort_order, name). Rebuilt whenever the
	// menu list changes; mutated in place during a drag.
	type Group = { key: number | null; title: string; items: Menu[] };
	let groups = $state<Group[]>([]);
	$effect(() => {
		const order = (a: Menu, b: Menu) => a.sort_order - b.sort_order || a.name.localeCompare(b.name);
		const active = menus.filter((m) => m.active);
		const next: Group[] = [];
		for (const c of categories) {
			const items = active.filter((m) => m.category_id === c.id).sort(order);
			if (items.length) next.push({ key: c.id, title: c.name, items });
		}
		const other = active.filter((m) => m.category_id == null).sort(order);
		if (other.length) next.push({ key: null, title: 'Other', items: other });
		groups = next;
	});

	function handleSort(gi: number, e: CustomEvent<{ items: Menu[] }>) {
		groups[gi].items = e.detail.items;
	}

	async function commitOrder(gi: number) {
		committing = true;
		try {
			const g = groups[gi];
			const ids = g.items.map((m) => m.id);
			// Optimistic: reflect the new order locally so the preview updates now.
			menus = menus.map((m) => {
				const idx = ids.indexOf(m.id);
				return idx >= 0 ? { ...m, sort_order: idx + 1 } : m;
			});
			try {
				await reorderMenus(g.key, ids);
				menus = await listMenus();
			} catch (err) {
				const m = (err as Error).message;
				showToast(m.includes('403') ? 'Owner only' : m, 'error');
				try {
					menus = await listMenus(); // best-effort reconcile
				} catch {
					// keep the optimistic order; the next load reconciles
				}
			}
		} finally {
			committing = false;
		}
	}

	function move(key: number, base: (number | null)[], from: number, to: number) {
		overrides = { ...overrides, [key]: movePrice(overrides[key] ?? base, from, to) };
	}

	// Place a flat-priced item's single price into a chosen column.
	function place(p: PartialRow, col: number, value: number) {
		const arr: (number | null)[] = p.columns.map(() => null);
		arr[col] = value;
		overrides = { ...overrides, [p.key]: arr };
	}

	// Drop the override for a row (back to its original placement / flat price).
	function clearRow(key: number) {
		const next = { ...overrides };
		delete next[key];
		overrides = next;
	}

	// Regenerate the preview (debounced) whenever the data, branding, or overrides change.
	$effect(() => {
		if (!hasItems) return;
		if (pdfEmpty) {
			previewUrl = '';
			blob = null;
			generating = false;
			return;
		}
		const doc = buildDocDefinition(pdfSheet, { ...brand });
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

	function saveBlob(b: Blob, filename: string) {
		const url = URL.createObjectURL(b);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	function download() {
		if (!blob) return;
		saveBlob(blob, 'menu.pdf');
	}

	let exporting = $state(false);
	async function downloadXlsx() {
		exporting = true;
		try {
			const wb = await buildMenuWorkbook(effectiveSheet);
			saveBlob(wb, 'menu.xlsx');
		} catch (e) {
			showToast((e as Error).message, 'error');
		} finally {
			exporting = false;
		}
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
					<label class="flex items-center justify-between">
						<span class="text-[var(--ios-label)]">Background</span>
						<input
							type="color"
							bind:value={brand.background}
							class="h-9 w-14 rounded-lg border border-[var(--ios-separator)] bg-transparent"
							aria-label="PDF background color"
						/>
					</label>
				</div>
			</Card>
		</div>

		<div>
			<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">Items</p>
			<Card padded={false}>
				<p class="px-3 pt-3 text-xs text-[var(--ios-label-tertiary)]">
					Drag ≡ to reorder within a category. Tap the eye to hide an item from the PDF (the Excel
					export always includes everything). Use ‹ › to move a variant price between empty columns,
					or tap a faint price to place a flat item into a column.
				</p>
				{#each groups as g, gi (g.key ?? 'other')}
					{@const cols =
						g.items.map((m) => rowById.get(m.id)?.columns ?? []).find((c) => c.length > 0) ?? []}
					<p
						class="px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-[var(--ios-label-tertiary)]"
					>
						{g.title.toUpperCase()}
					</p>
					{#if cols.length > 0}
						<div
							class="flex items-center gap-2 px-3 pb-1 text-[10px] tracking-wide text-[var(--ios-label-tertiary)] uppercase"
						>
							<span class="invisible px-1 text-lg select-none" aria-hidden="true">≡</span>
							<span class="flex-1"></span>
							<div class="flex items-center gap-1">
								{#each cols as c (c)}
									<span class="w-14 text-right">{columnLabel(c)}</span>
								{/each}
							</div>
							<span class="h-8 w-8"></span>
						</div>
					{/if}
					<ul
						class="divide-y divide-[var(--ios-separator)]"
						use:dndzone={{
							items: g.items,
							flipDurationMs: 150,
							dropTargetStyle: {},
							dropFromOthersDisabled: true,
							dragDisabled: committing
						}}
						onconsider={(e) => handleSort(gi, e)}
						onfinalize={(e) => {
							handleSort(gi, e);
							commitOrder(gi);
						}}
					>
						{#each g.items as m (m.id)}
							{@const hidden = excluded.has(m.id)}
							{@const partial = partialById.get(m.id)}
							{@const info = rowById.get(m.id)}
							{@const cur = partial ? (overrides[m.id] ?? partial.prices) : null}
							<li class="flex items-center gap-2 px-3 py-2" class:opacity-40={hidden}>
								<span
									class="cursor-grab px-1 text-lg text-[var(--ios-label-tertiary)] select-none"
									aria-hidden="true">≡</span
								>
								<span class="flex-1 text-[var(--ios-label)]" class:line-through={hidden}
									>{m.name}</span
								>
								<div class="flex items-center gap-1 text-sm tabular-nums">
									{#if partial && cur}
										{#each partial.columns as col, ci (col)}
											{@const v = cur[ci]}
											<span class="flex w-14 items-center justify-end gap-0.5">
												{#if v != null}
													{#if ci > 0 && cur[ci - 1] == null}
														<button
															type="button"
															class="flex h-6 w-6 items-center justify-center rounded-full text-[var(--ios-blue)] active:bg-[var(--ios-fill)]"
															aria-label={`Move ${m.name} ${col} price left`}
															onclick={() => move(m.id, partial.prices, ci, ci - 1)}>‹</button
														>
													{/if}
													<span class="text-[var(--ios-label)]">{formatBaht(v)}</span>
													{#if ci < partial.columns.length - 1 && cur[ci + 1] == null}
														<button
															type="button"
															class="flex h-6 w-6 items-center justify-center rounded-full text-[var(--ios-blue)] active:bg-[var(--ios-fill)]"
															aria-label={`Move ${m.name} ${col} price right`}
															onclick={() => move(m.id, partial.prices, ci, ci + 1)}>›</button
														>
													{/if}
												{:else if partial.single != null && cur.every((x) => x == null)}
													<button
														type="button"
														class="rounded px-1 text-xs text-[var(--ios-label-tertiary)] underline decoration-dotted active:bg-[var(--ios-fill)]"
														aria-label={`Place ${m.name} price in ${col}`}
														onclick={() => place(partial, ci, partial.single ?? 0)}
														>{formatBaht(partial.single)}</button
													>
												{:else}
													<span class="text-[var(--ios-label-tertiary)]">·</span>
												{/if}
											</span>
										{/each}
										{#if m.id in overrides}
											<button
												type="button"
												class="text-xs text-[var(--ios-blue)]"
												onclick={() => clearRow(m.id)}>Reset</button
											>
										{/if}
									{:else if info}
										{#if info.columns.length === 0}
											<span class="w-14 text-right text-[var(--ios-label-secondary)]"
												>{info.row.single == null ? '' : formatBaht(info.row.single)}</span
											>
										{:else}
											{#each info.columns as _c, ci (ci)}
												<span class="w-14 text-right text-[var(--ios-label-secondary)]"
													>{info.row.prices[ci] == null
														? '·'
														: formatBaht(info.row.prices[ci]!)}</span
												>
											{/each}
										{/if}
									{/if}
								</div>
								<button
									type="button"
									class="flex h-8 w-8 items-center justify-center rounded-full active:bg-[var(--ios-fill)]"
									aria-label={hidden ? `Show ${m.name} in PDF` : `Hide ${m.name} from PDF`}
									aria-pressed={hidden}
									onclick={() => toggleExcluded(m.id)}>{hidden ? '🚫' : '👁'}</button
								>
							</li>
						{/each}
					</ul>
				{/each}
			</Card>
		</div>

		<div>
			<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">Preview</p>
			<Card padded={false}>
				<div class="relative">
					{#if pdfEmpty}
						<div
							class="flex h-[70vh] items-center justify-center px-6 text-center text-sm text-[var(--ios-label-secondary)]"
						>
							All items are hidden from the PDF. Show at least one item to preview or download.
						</div>
					{:else if previewUrl}
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

		<div class="space-y-3">
			<Button onclick={download} disabled={!blob || generating}>
				{generating ? 'Generating…' : 'Download PDF'}
			</Button>
			<Button variant="tinted" onclick={downloadXlsx} disabled={exporting}>
				{exporting ? 'Exporting…' : 'Download Excel'}
			</Button>
		</div>
	{/if}
</div>
