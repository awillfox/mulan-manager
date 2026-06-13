<script lang="ts">
	import BottomSheet from '$lib/components/ios/BottomSheet.svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import { showToast } from '$lib/components/ios/toast.svelte';
	import {
		listCategories,
		createCategory,
		updateCategory,
		deleteCategory,
		type Category
	} from '$lib/api/categories';

	let { open = $bindable(false), onchanged }: { open?: boolean; onchanged?: () => void } = $props();

	let cats = $state<Category[]>([]);
	let newName = $state('');

	async function refresh() {
		try {
			cats = await listCategories();
		} catch (e) {
			showToast((e as Error).message, 'error');
		}
	}
	async function add() {
		if (!newName.trim()) return;
		try {
			await createCategory(newName.trim());
			newName = '';
			await refresh();
			onchanged?.();
		} catch (e) {
			showToast((e as Error).message, 'error');
		}
	}
	async function rename(c: Category) {
		const name = prompt('Rename category', c.name);
		if (!name || !name.trim()) return;
		try {
			await updateCategory(c.id, name.trim());
			await refresh();
			onchanged?.();
		} catch (e) {
			showToast((e as Error).message, 'error');
		}
	}
	async function remove(c: Category) {
		if (!confirm(`Delete "${c.name}"? Its items become uncategorized.`)) return;
		try {
			await deleteCategory(c.id);
			await refresh();
			onchanged?.();
		} catch (e) {
			showToast((e as Error).message, 'error');
		}
	}
	$effect(() => {
		if (open) refresh();
	});
</script>

<BottomSheet bind:open title="Categories">
	<div class="space-y-3 pb-6">
		<div class="flex gap-2">
			<input
				bind:value={newName}
				placeholder="New category"
				class="h-11 flex-1 rounded-xl bg-[var(--ios-fill)] px-3 text-[var(--ios-label)] outline-none"
			/>
			<Button variant="tinted" onclick={add}>Add</Button>
		</div>
		{#each cats as c (c.id)}
			<div
				class="flex items-center justify-between border-b border-[var(--ios-separator)] py-2 last:border-0"
			>
				<span class="text-[var(--ios-label)]">{c.name}</span>
				<div class="flex gap-3">
					<button type="button" onclick={() => rename(c)} class="text-[var(--ios-blue)]">Rename</button>
					<button type="button" onclick={() => remove(c)} class="text-[var(--ios-red)]">Delete</button>
				</div>
			</div>
		{/each}
	</div>
</BottomSheet>
