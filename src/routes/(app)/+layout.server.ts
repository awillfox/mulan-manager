import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	// hooks.server.ts already guaranteed a user for non-public routes.
	return { user: locals.user };
};
