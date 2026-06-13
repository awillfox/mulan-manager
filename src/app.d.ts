export interface ManagerUser {
	id: number;
	username: string;
	name: string;
	role: 'owner' | 'staff';
}

declare global {
	namespace App {
		interface Locals {
			user: ManagerUser | null;
		}
	}
}

export {};
