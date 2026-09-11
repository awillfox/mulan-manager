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
		uploadImage,
		addPromo,
		deletePromo,
		proxiedImageUrl,
		imageUrl,
		type Slide
	} from '$lib/api/images';

	let slides = $state<Slide[]>([]);
	let loading = $state(true);
	let uploading = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	// GET /api/display/playlist deliberately omits the display_images row id
	// (see domain.Slide in mulan/internal/display/domain/slide.go — Kind,
	// URL, Width, Height, Name, Price only) and the backend has no
	// GET /api/display/promos listing endpoint (a ListAllPromoSlides sqlc
	// query exists but is not wired to any route), so a promo already in the
	// playlist cannot be resolved back to the id DELETE /promos/{id} needs.
	// The only moment that id is ever learned is the 201 response from
	// addPromo(), right when this tab creates it. Track those here, keyed by
	// the slide's own URL (content-addressed — a matching URL is the same
	// image) so a Delete control appears only where it will actually work. A
	// promo added in an earlier session, or from another device, still shows
	// up in the list — just without a delete control.
	let knownPromoIds = $state<Record<string, number>>({});

	async function refresh() {
		loading = true;
		try {
			slides = await listPlaylist();
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
			const promo = await addPromo(img.id);
			knownPromoIds[imageUrl(img.object_key)] = promo.id;
			await refresh();
			showToast('Promo added');
		} catch (e) {
			showToast((e as Error).message, 'error');
		} finally {
			uploading = false;
		}
	}

	async function remove(slide: Slide) {
		const id = knownPromoIds[slide.url];
		if (id == null) return;
		if (!confirm('Remove this promo from the display?')) return;
		try {
			await deletePromo(id);
			const rest = { ...knownPromoIds };
			delete rest[slide.url];
			knownPromoIds = rest;
			await refresh();
			showToast('Promo removed');
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

<div class="space-y-3 px-4 pt-2 pb-6">
	<p class="px-1 text-sm text-[var(--ios-label-secondary)]">
		The playlist the customer display plays: menu photos (attached from an item's editor under Menu)
		interleaved with promo images added here.
	</p>

	{#if loading}
		<Spinner />
	{:else if slides.length === 0}
		<EmptyState
			title="Nothing to show yet"
			subtitle="Add a promo image, or attach photos to menu items under Menu."
		>
			{#snippet action()}
				<Button onclick={pick} disabled={uploading}>Add Promo</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<Card padded={false}>
			{#each slides as slide, i (slide.url + i)}
				<ListRow divider={i < slides.length - 1}>
					<div class="flex items-center gap-3">
						<div class="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[var(--ios-fill)]">
							<img src={proxiedImageUrl(slide.url)} alt="" class="h-full w-full object-cover" />
						</div>
						<div class="min-w-0">
							<div class="flex items-center gap-2">
								<span
									class="shrink-0 rounded-full px-2 py-0.5 text-xs {slide.kind === 'promo'
										? 'bg-[var(--ios-blue)]/15 text-[var(--ios-blue)]'
										: 'bg-[var(--ios-fill)] text-[var(--ios-label-secondary)]'}"
								>
									{slide.kind === 'promo' ? 'Promo' : 'Menu'}
								</span>
								{#if slide.name}
									<span class="truncate font-medium text-[var(--ios-label)]">{slide.name}</span>
								{/if}
							</div>
							{#if slide.price != null}
								<p class="text-sm text-[var(--ios-label-secondary)]">฿{slide.price.toFixed(2)}</p>
							{/if}
						</div>
					</div>
					{#snippet trailing()}
						{#if slide.kind === 'promo'}
							{#if knownPromoIds[slide.url] != null}
								<button
									type="button"
									onclick={() => remove(slide)}
									class="px-2 py-3 text-[var(--ios-red)]">Remove</button
								>
							{:else}
								<span class="text-xs text-[var(--ios-label-tertiary)]">Added elsewhere</span>
							{/if}
						{/if}
					{/snippet}
				</ListRow>
			{/each}
		</Card>
	{/if}

	<input
		bind:this={fileInput}
		type="file"
		accept="image/png,image/jpeg"
		class="hidden"
		onchange={onFile}
	/>
</div>
