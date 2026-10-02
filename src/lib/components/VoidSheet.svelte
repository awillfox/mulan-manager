<script lang="ts">
	import BottomSheet from '$lib/components/ios/BottomSheet.svelte';
	import { showToast } from '$lib/components/ios/toast.svelte';
	import { baht } from '$lib/format';
	import type { OrderRow } from '$lib/api/reports';
	import {
		listVoidReasons,
		previewVoid,
		voidOrder,
		buildVoidReq,
		reasonValid,
		breakdownLines,
		OTHER,
		type VoidReason,
		type VoidRes
	} from '$lib/api/voids';

	let {
		open = $bindable(false),
		order,
		onDone
	}: { open?: boolean; order: OrderRow | null; onDone: () => void } = $props();

	let reasons = $state<VoidReason[]>([]);
	let whole = $state(false);
	let qtys = $state<Record<number, number>>({});
	let reason = $state('');
	let text = $state('');
	let preview = $state<VoidRes | null>(null);
	let previewError = $state('');
	let busy = $state(false);
	let previewLoading = $state(false);

	const remaining = (li: { qty: number; voided_qty: number }) => li.qty - (li.voided_qty ?? 0);

	// Reset the form each time the sheet opens on an order. Reads only open
	// and order, so loading the reasons below can't re-run it and wipe input.
	$effect(() => {
		if (!open || !order) return;
		whole = false;
		qtys = Object.fromEntries(order.line_items.map((li) => [li.id, 0]));
		reason = '';
		text = '';
		preview = null;
		previewError = '';
	});

	$effect(() => {
		if (!open || reasons.length > 0) return;
		listVoidReasons()
			.then((r) => (reasons = r))
			.catch((e) => showToast((e as Error).message, 'error'));
	});

	$effect(() => {
		if (whole && order) qtys = Object.fromEntries(order.line_items.map((li) => [li.id, remaining(li)]));
	});

	const anySelected = $derived(whole || Object.values(qtys).some((n) => n > 0));
	const canSubmit = $derived(
		anySelected &&
			reasonValid(reason, text) &&
			!busy &&
			!previewError &&
			preview !== null &&
			!previewLoading
	);

	// Live refund preview, debounced. The preview runs the real void in a
	// rolled-back transaction, so the amount shown is the amount voided.
	let timer: ReturnType<typeof setTimeout> | undefined;
	// Request sequence token: a late response (or rejection) from an older
	// selection/order must not overwrite the current selection's preview.
	let reqSeq = 0;
	$effect(() => {
		// Reason is not needed for a preview; leaving it out means typing the
		// reason text doesn't fire a request per keystroke.
		const req = buildVoidReq(whole, qtys, '', '');
		if (!open || !order || !anySelected) {
			reqSeq++; // drop any in-flight result
			previewLoading = false;
			preview = null;
			previewError = '';
			return;
		}
		clearTimeout(timer);
		const code = order.code;
		const seq = ++reqSeq;
		previewLoading = true;
		preview = null;
		previewError = '';
		timer = setTimeout(() => {
			previewVoid(code, req)
				.then((r) => {
					if (seq !== reqSeq) return;
					preview = r;
					previewError = '';
					previewLoading = false;
				})
				.catch((e) => {
					if (seq !== reqSeq) return;
					preview = null;
					previewError = (e as Error).message;
					previewLoading = false;
				});
		}, 300);
		return () => {
			clearTimeout(timer);
			reqSeq++;
		};
	});

	function step(id: number, delta: number, max: number) {
		const next = Math.min(max, Math.max(0, (qtys[id] ?? 0) + delta));
		qtys = { ...qtys, [id]: next };
	}

	async function confirm() {
		if (!order || !canSubmit) return;
		busy = true;
		try {
			const r = await voidOrder(order.code, buildVoidReq(whole, qtys, reason, text));
			showToast(
				r.manual_refund ? `Voided — refund ${baht(r.refund_amount)} manually` : `Voided — hand back ${baht(r.refund_amount)}`,
				'info'
			);
			open = false;
			onDone();
		} catch (e) {
			showToast((e as Error).message, 'error');
		} finally {
			busy = false;
		}
	}
</script>

<BottomSheet bind:open title={order ? `Void ${order.code}` : 'Void'}>
	{#if order}
		<div class="space-y-4 px-5 pb-6 text-sm">
			<label class="flex items-center justify-between">
				<span class="text-[var(--ios-label)]">Void whole order</span>
				<input type="checkbox" bind:checked={whole} />
			</label>

			<div class="space-y-2">
				{#each order.line_items as li (li.id)}
					{@const max = remaining(li)}
					<div class="flex items-center justify-between gap-3" class:opacity-40={max === 0}>
						<span class="text-[var(--ios-label)]">
							{li.name}{li.base_option_name ? ` (${li.base_option_name})` : ''}
							<span class="text-[var(--ios-label-secondary)]">· {max} left</span>
						</span>
						<div class="flex items-center gap-2">
							<button
								class="h-8 w-8 rounded-full bg-[var(--ios-fill)] disabled:opacity-40"
								disabled={whole || max === 0 || (qtys[li.id] ?? 0) === 0}
								onclick={() => step(li.id, -1, max)}>−</button
							>
							<span class="w-6 text-center font-mono">{qtys[li.id] ?? 0}</span>
							<button
								class="h-8 w-8 rounded-full bg-[var(--ios-fill)] disabled:opacity-40"
								disabled={whole || max === 0 || (qtys[li.id] ?? 0) >= max}
								onclick={() => step(li.id, 1, max)}>+</button
							>
						</div>
					</div>
				{/each}
			</div>

			<label class="block space-y-1">
				<span class="text-[var(--ios-label-secondary)]">เหตุผล (Reason)</span>
				<select
					bind:value={reason}
					class="w-full rounded-lg border border-[var(--ios-separator)] bg-[var(--ios-card)] px-2 py-2 text-[var(--ios-label)]"
				>
					<option value="" disabled>— เลือกเหตุผล —</option>
					{#each reasons as r (r.code)}
						<option value={r.code}>{r.label}</option>
					{/each}
				</select>
			</label>
			{#if reason === OTHER}
				<textarea
					bind:value={text}
					maxlength="500"
					rows="2"
					placeholder="โปรดระบุเหตุผล"
					class="w-full rounded-lg border border-[var(--ios-separator)] bg-[var(--ios-card)] px-2 py-2 text-[var(--ios-label)]"
				></textarea>
			{/if}

			{#if previewError}
				<p class="text-[var(--ios-red)]">{previewError}</p>
			{:else if previewLoading}
				<p class="text-[var(--ios-label-secondary)]">Calculating…</p>
			{:else if preview}
				<div class="space-y-1 rounded-xl bg-[var(--ios-fill)] p-3">
					<div class="flex justify-between font-semibold">
						<span>Refund</span><span class="font-mono">{baht(preview.refund_amount)}</span>
					</div>
					{#if preview.manual_refund}
						<p class="text-[var(--ios-label-secondary)]">
							Paid by {preview.refund_method || 'unknown method'} — refund manually; drawer is not touched.
						</p>
					{:else}
						{#each breakdownLines(preview.refund_breakdown) as line (line)}
							<p class="text-[var(--ios-label-secondary)]">Hand back {line}</p>
						{/each}
					{/if}
					{#if preview.points_reversed > 0}
						<p class="text-[var(--ios-label-secondary)]">Member points reversed: {preview.points_reversed}</p>
					{/if}
				</div>
			{/if}

			<button
				class="w-full rounded-xl bg-[var(--ios-red)] py-3 font-semibold text-white disabled:opacity-40"
				disabled={!canSubmit}
				onclick={confirm}>{busy ? 'Voiding…' : 'Confirm void'}</button
			>
		</div>
	{/if}
</BottomSheet>
