<script lang="ts">
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Card from '$lib/components/ios/Card.svelte';
	import ListRow from '$lib/components/ios/ListRow.svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import Spinner from '$lib/components/ios/Spinner.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import { showToast } from '$lib/components/ios/toast.svelte';
	import {
		listPlaylist,
		listPromos,
		uploadImage,
		addPromo,
		deletePromo,
		proxiedImageUrl,
		type Slide,
		type PromoRow
	} from '$lib/api/images';

	let promos = $state<PromoRow[]>([]);
	let menuSlides = $state<Slide[]>([]);
	let loading = $state(true);
	let uploading = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	async function refresh() {
		loading = true;
		try {
			// GET /api/display/promos is the management view: every live promo,
			// with its id — the source of truth for this list and for what
			// deletePromo() can target. GET /api/display/playlist is the kiosk's
			// resolved view (only the subset actually interleaved into one
			// playback, and with no ids at all); it's used here only for the
			// read-only "which menu items have a photo" list, since that's the
			// one place that information surfaces.
			const [promoRows, slides] = await Promise.all([listPromos(), listPlaylist()]);
			promos = promoRows;
			menuSlides = slides.filter((s) => s.kind === 'menu');
		} catch (e) {
			showToast((e as Error).message, 'error');
		} finally {
			loading = false;
		}
	}

	function pick() {
		fileInput?.click();
	}

	async function onFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = ''; // allow re-selecting the same file
		if (!file) return;
		uploading = true;
		try {
			const img = await uploadImage(file);
			await addPromo(img.id);
			await refresh();
			showToast('Promo added');
		} catch (e) {
			showToast((e as Error).message, 'error');
		} finally {
			uploading = false;
		}
	}

	async function remove(row: PromoRow) {
		if (!confirm('Remove this promo from the display?')) return;
		try {
			// A 404 here just means the promo is already gone (deleted
			// elsewhere, or this list was stale) — a normal outcome, not an
			// error the owner needs to interpret.
			const result = await deletePromo(row.id);
			await refresh();
			showToast(result.alreadyGone ? 'Already removed' : 'Promo removed');
		} catch (e) {
			showToast((e as Error).message, 'error');
		}
	}

	$effect(() => {
		refresh();
	});
</script>

<NavBar title="Display Images">
	{#snippet trailing()}
		<Button variant="plain" onclick={pick} disabled={uploading}>
			{uploading ? 'Uploading…' : '＋ Add Promo'}
		</Button>
	{/snippet}
</NavBar>

<div class="space-y-5 px-4 pt-2 pb-6">
	{#if loading}
		<Spinner />
	{:else}
		<div>
			<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">Promos</p>
			{#if promos.length === 0}
				<EmptyState title="No promos yet" subtitle="Add an image to rotate into the display.">
					{#snippet action()}
						<Button onclick={pick} disabled={uploading}>Add Promo</Button>
					{/snippet}
				</EmptyState>
			{:else}
				<Card padded={false}>
					{#each promos as row, i (row.id)}
						<ListRow divider={i < promos.length - 1}>
							<div class="flex items-center gap-3">
								<div class="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[var(--ios-fill)]">
									<img src={proxiedImageUrl(row.url)} alt="" class="h-full w-full object-cover" />
								</div>
								<span
									class="rounded-full bg-[var(--ios-blue)]/15 px-2 py-0.5 text-xs text-[var(--ios-blue)]"
								>
									Promo
								</span>
							</div>
							{#snippet trailing()}
								<button
									type="button"
									onclick={() => remove(row)}
									class="px-2 py-3 text-[var(--ios-red)]">Remove</button
								>
							{/snippet}
						</ListRow>
					{/each}
				</Card>
			{/if}
		</div>

		<div>
			<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">Menu Photos</p>
			{#if menuSlides.length === 0}
				<EmptyState
					title="No menu photos yet"
					subtitle="Attach photos to menu items under Menu — a photo-less item never appears on the display."
				/>
			{:else}
				<Card padded={false}>
					{#each menuSlides as slide, i (slide.url + i)}
						<ListRow divider={i < menuSlides.length - 1}>
							<div class="flex items-center gap-3">
								<div class="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[var(--ios-fill)]">
									<img src={proxiedImageUrl(slide.url)} alt="" class="h-full w-full object-cover" />
								</div>
								<div class="min-w-0">
									<span class="truncate font-medium text-[var(--ios-label)]">{slide.name}</span>
									{#if slide.price != null}
										<p class="text-sm text-[var(--ios-label-secondary)]">
											฿{slide.price.toFixed(2)}
										</p>
									{/if}
								</div>
							</div>
						</ListRow>
					{/each}
				</Card>
			{/if}
		</div>
	{/if}

	<input
		bind:this={fileInput}
		type="file"
		accept="image/png,image/jpeg"
		class="hidden"
		onchange={onFile}
	/>
</div>
