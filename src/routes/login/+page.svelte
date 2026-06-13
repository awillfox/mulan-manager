<script lang="ts">
	import { enhance } from '$app/forms';
	let { form } = $props();
	let submitting = $state(false);
</script>

<div class="flex min-h-screen items-center justify-center bg-[var(--ios-grouped-bg)] px-6">
	<div class="w-full max-w-sm">
		<h1 class="mb-1 text-center text-3xl font-bold text-[var(--ios-label)]">Mulan Manager</h1>
		<p class="mb-8 text-center text-[var(--ios-label-secondary)]">Sign in to continue</p>

		<form
			method="POST"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
			class="space-y-4"
		>
			{#if form?.error}
				<p class="rounded-xl bg-[var(--ios-red-soft)] px-4 py-3 text-sm text-[var(--ios-red)]">
					{form.error}
				</p>
			{/if}
			<input
				name="username"
				autocomplete="username"
				placeholder="Username"
				value={form?.username ?? ''}
				class="h-12 w-full rounded-xl bg-[var(--ios-card)] px-4 text-[var(--ios-label)] outline-none focus:ring-2 focus:ring-[var(--ios-blue)]"
			/>
			<input
				name="password"
				type="password"
				autocomplete="current-password"
				placeholder="Password"
				class="h-12 w-full rounded-xl bg-[var(--ios-card)] px-4 text-[var(--ios-label)] outline-none focus:ring-2 focus:ring-[var(--ios-blue)]"
			/>
			<button
				type="submit"
				disabled={submitting}
				class="h-12 w-full rounded-xl bg-[var(--ios-blue)] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
			>
				{submitting ? 'Signing in…' : 'Sign In'}
			</button>
		</form>
	</div>
</div>
