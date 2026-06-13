# Manager Build-out Plan 1 — Backend Auth-Scoping + Proxy Allowlist

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect the manager API routes (menus/categories/option-groups/options/members/cashiers/settings) with `RequireManager`/`RequireRole(owner)` while keeping POS-shared reads open, and add those routes to the SvelteKit proxy allowlist.

**Architecture:** Restructure `main.go`'s `/api` block into three method-level groups (open, `RequireManager`, nested `RequireRole(owner)`) registering individual routes — mirroring how discounts is already split. Export the cashier handler's methods so they can be wired individually.

**Tech Stack:** Go 1.25, chi/v5, the existing `internal/managerauth` middleware. Backend repo `/home/nate/Dev/mulan` (branch `feat/member`). Frontend repo `/home/nate/Dev/mulan-manager` (branch `main`).

**Reference:** the discounts split in `main.go` (GET `/discounts` under `RequireManager`, writes under `RequireRole(owner)`) is the exact pattern to extend.

---

### Task 1: Export cashier handler methods

**Files:**
- Modify: `/home/nate/Dev/mulan/internal/cashier/http/handler.go`

The cashier methods are unexported (`list`, `create`, `login`, `update`, `updatePin`, `delete`) so `main.go` can't wire them individually. Export them.

- [ ] **Step 1: Rename the methods to exported names**

In `internal/cashier/http/handler.go`, rename receiver methods and their references in `Routes`:
`list`→`List`, `create`→`Create`, `login`→`Login`, `update`→`Update`, `updatePin`→`UpdatePin`, `delete`→`Delete`. The `Routes(r chi.Router)` body becomes:
```go
func (h *Handler) Routes(r chi.Router) {
	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Post("/login", h.Login)
	r.Patch("/{id}", h.Update)
	r.Patch("/{id}/pin", h.UpdatePin)
	r.Delete("/{id}", h.Delete)
}
```
(`Routes` will stop being mounted after Task 2, but keep it compiling/consistent.)

- [ ] **Step 2: Build**

Run: `cd /home/nate/Dev/mulan && go build ./...`
Expected: exit 0.

- [ ] **Step 3: Commit**
```bash
cd /home/nate/Dev/mulan
git add internal/cashier/http/handler.go
git commit -m "refactor(cashier): export handler methods for granular routing"
```

---

### Task 2: Restructure main.go `/api` routing into auth groups

**Files:**
- Modify: `/home/nate/Dev/mulan/main.go`

- [ ] **Step 1: Replace the `/api` block**

Replace the entire `r.Route("/api", func(r chi.Router) { ... })` block with the following. (Removes the bulk `r.Route("/menus", …)`, `r.Route("/menu-categories", …)`, `r.Route("/option-groups", …)`, `r.Route("/options", …)`, `r.Route("/members", …)`, `r.Route("/cashiers", …)`, `r.Route("/settings", …)` open mounts and re-registers their routes individually in the right groups. Leaves `/orders`, `/cash-drawer`, `/wifi` mounts open.)

```go
	r.Route("/api", func(r chi.Router) {
		// ---------- OPEN: POS / agent / shared (no auth) ----------
		r.Get("/menus", menuHandler.List)
		r.Get("/menu-categories", categoryHandler.List)
		r.Get("/settings", settingsHandler.Get)
		r.Get("/settings/logo", settingsHandler.GetLogo)
		r.Get("/members/lookup", memberHandler.Lookup)
		r.Post("/cashiers/login", cashierHandler.Login)
		r.Route("/orders", orderHandler.Routes)
		r.Route("/cash-drawer", cashDrawerHandler.Routes)
		r.Mount("/wifi", wifiHandler.Routes())
		r.Get("/discounts/active", discountHandler.ListActive)
		r.Route("/auth", managerAuthHandler.Routes) // POST /auth/login

		// ---------- RequireManager: any logged-in manager (reads) ----------
		r.Group(func(r chi.Router) {
			r.Use(managerauthhttp.RequireManager(managerAuthSvc))

			r.Post("/auth/logout", managerAuthHandler.Logout)
			r.Get("/auth/me", managerAuthHandler.Me)
			r.Get("/discounts", discountHandler.List)
			r.Get("/option-groups", optionGroupHandler.ListGroups)
			r.Get("/members", memberHandler.List)
			r.Get("/members/{id}/orders", memberHandler.Orders)
			r.Get("/cashiers", cashierHandler.List)

			// ---------- RequireRole(owner): writes + owner data ----------
			r.Group(func(r chi.Router) {
				r.Use(managerauthhttp.RequireRole(managerauthdomain.RoleOwner))

				// discounts
				r.Post("/discounts", discountHandler.Create)
				r.Patch("/discounts/{id}", discountHandler.Update)
				r.Delete("/discounts/{id}", discountHandler.Delete)
				// dashboard
				r.Route("/dashboard", dashboardHandler.Routes)
				// menus
				r.Post("/menus", menuHandler.Create)
				r.Patch("/menus/{id}", menuHandler.Update)
				r.Patch("/menus/{id}/toggle", menuHandler.Toggle)
				r.Delete("/menus/{id}", menuHandler.Delete)
				r.Put("/menus/{id}/option-groups", optionGroupHandler.SetMenuGroups)
				r.Put("/menus/{id}/base-options", baseOptionHandler.SetMenuBaseOptions)
				// categories
				r.Post("/menu-categories", categoryHandler.Create)
				r.Patch("/menu-categories/{id}", categoryHandler.Update)
				r.Delete("/menu-categories/{id}", categoryHandler.Delete)
				// option groups + options
				r.Post("/option-groups", optionGroupHandler.CreateGroup)
				r.Patch("/option-groups/{id}", optionGroupHandler.UpdateGroup)
				r.Delete("/option-groups/{id}", optionGroupHandler.DeleteGroup)
				r.Post("/option-groups/{id}/options", optionGroupHandler.CreateOption)
				r.Patch("/options/{id}", optionGroupHandler.UpdateOption)
				r.Delete("/options/{id}", optionGroupHandler.DeleteOption)
				// members
				r.Post("/members", memberHandler.Create)
				r.Patch("/members/{id}", memberHandler.Update)
				r.Delete("/members/{id}", memberHandler.Delete)
				// cashiers
				r.Post("/cashiers", cashierHandler.Create)
				r.Patch("/cashiers/{id}", cashierHandler.Update)
				r.Patch("/cashiers/{id}/pin", cashierHandler.UpdatePin)
				r.Delete("/cashiers/{id}", cashierHandler.Delete)
				// settings
				r.Patch("/settings", settingsHandler.Update)
				r.Put("/settings/logo", settingsHandler.PutLogo)
				r.Delete("/settings/logo", settingsHandler.DeleteLogo)
			})
		})
	})
```

> NOTE: `GET /api/option-groups` is placed under `RequireManager`. Task 3 verifies POS doesn't call it; if it does, MOVE that one line up into the OPEN section.

- [ ] **Step 2: Build + vet + fmt**

Run: `cd /home/nate/Dev/mulan && go build ./... && go vet ./... && gofmt -w main.go`
Expected: all exit 0.

- [ ] **Step 3: Commit**
```bash
cd /home/nate/Dev/mulan
git add main.go
git commit -m "feat(auth): scope manager routes (owner writes, manager reads, POS open)"
```

---

### Task 3: Verify POS does not call `/api/option-groups` directly

**Files:** none (investigation).

- [ ] **Step 1: Grep POS/agent + POS templates for option-group calls**

Run:
```bash
cd /home/nate/Dev/mulan
grep -rnE "option-groups|/api/options" mulan-agent/ templates/pos/ templates/layouts/ 2>/dev/null || echo "NO direct POS calls to option-groups"
```
Expected: ideally "NO direct POS calls". POS gets option groups embedded in `GET /api/menus` (the menu response includes `option_groups[]`).

- [ ] **Step 2: Decide**

If the grep found POS calling `/api/option-groups` (or `/api/options`), MOVE `r.Get("/option-groups", optionGroupHandler.ListGroups)` from the `RequireManager` group up into the OPEN section of `main.go`, rebuild, and amend the Task 2 commit. Otherwise leave as-is. Record the finding in the task notes.

---

### Task 4: POS-safety + auth curl matrix

**Files:** none (verification). Needs the seeded `owner` (owner/changeme123) and a `staff` user.

- [ ] **Step 1: Start the server on a test port + seed a staff user**
```bash
cd /home/nate/Dev/mulan
set -a; . ./.env; set +a
go run ./cmd/create-manager-user -username staff1 -password "staffpass1" -name "Staff One" -role staff || true
PORT=18080 go build -o /tmp/mulan_t . && PORT=18080 /tmp/mulan_t >/tmp/mt.log 2>&1 &
SRV=$!
for i in $(seq 1 20); do curl -s -o /dev/null localhost:18080/api/menus && break; sleep 0.5; done
```

- [ ] **Step 2: Run the matrix**
```bash
OWNER=$(curl -s localhost:18080/api/auth/login -H 'Content-Type: application/json' -d '{"username":"owner","password":"changeme123"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
STAFF=$(curl -s localhost:18080/api/auth/login -H 'Content-Type: application/json' -d '{"username":"staff1","password":"staffpass1"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
code(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }
echo "POS OPEN (expect 200, NO token):"
echo "  menus=$(code localhost:18080/api/menus)  categories=$(code localhost:18080/api/menu-categories)  settings=$(code localhost:18080/api/settings)  members/lookup=$(code 'localhost:18080/api/members/lookup?phone=0')"
echo "manager reads (expect 401 no-token, 200 staff):"
echo "  option-groups noauth=$(code localhost:18080/api/option-groups) staff=$(code -H "Authorization: Bearer $STAFF" localhost:18080/api/option-groups)"
echo "  members noauth=$(code localhost:18080/api/members) staff=$(code -H "Authorization: Bearer $STAFF" localhost:18080/api/members)"
echo "owner writes (expect staff 403, owner 200/201):"
echo "  POST menu-categories staff=$(code -X POST -H "Authorization: Bearer $STAFF" -H 'Content-Type: application/json' -d '{\"name\":\"x\"}' localhost:18080/api/menu-categories)"
NEW=$(curl -s -X POST -H "Authorization: Bearer $OWNER" -H 'Content-Type: application/json' -d '{"name":"plan1-cat"}' localhost:18080/api/menu-categories)
echo "  POST menu-categories owner_body=$NEW"
CID=$(echo "$NEW" | sed -E 's/.*"id":([0-9]+).*/\1/')
echo "  DELETE menu-categories owner=$(code -X DELETE -H "Authorization: Bearer $OWNER" localhost:18080/api/menu-categories/$CID)"
kill $SRV 2>/dev/null
psql "$PSQL_URL" -c "DELETE FROM manager_users WHERE username='staff1';" 2>/dev/null
```
EXPECTED: POS routes all `200`; manager reads `401` without token + `200` with staff; owner writes `403` for staff, `201`/`204` for owner. If any POS route is not 200, a shared read got wrapped — fix `main.go` before proceeding. Paste actual numbers.

- [ ] **Step 3: Full test sweep**

Run: `cd /home/nate/Dev/mulan && set -a; . ./.env; set +a; go test ./...`
Expected: PASS (no regressions).

---

### Task 5: Add the routes to the SvelteKit proxy allowlist

**Files:**
- Modify: `/home/nate/Dev/mulan-manager/src/routes/api/[...path]/+server.ts`

- [ ] **Step 1: Extend the ALLOW list**

In `src/routes/api/[...path]/+server.ts`, change the `ALLOW` array to:
```ts
const ALLOW = [
	'discounts',
	'dashboard',
	'auth/me',
	'auth/logout',
	'menus',
	'menu-categories',
	'option-groups',
	'options',
	'members',
	'cashiers',
	'settings'
];
```

- [ ] **Step 2: Type-check + build**

Run: `cd /home/nate/Dev/mulan-manager && npm run check && npm run build`
Expected: 0 errors; build succeeds.

- [ ] **Step 3: Commit**
```bash
cd /home/nate/Dev/mulan-manager
git add src/routes/api/[...path]/+server.ts
git commit -m "feat: allow manager routes through the API proxy"
```

---

## Self-Review (completed)

- **Spec §2 coverage:** open/manager/owner classification → Task 2 routing block matches the spec table exactly (POS-open list, manager reads, owner writes) ✓. POS-safety verification → Task 4 curl matrix ✓. `/api/option-groups` POS check → Task 3 ✓. §3 proxy allowlist → Task 5 ✓.
- **No placeholders:** every step has concrete code/commands. The one conditional (Task 3 move option-groups) is an explicit decision with the exact edit.
- **Type/name consistency:** cashier methods exported in Task 1 (`Login`, `List`, `Create`, `Update`, `UpdatePin`, `Delete`) are the exact names referenced in Task 2's routing block. All other handler methods (`menuHandler.List/Create/Update/Toggle/Delete`, `categoryHandler.*`, `optionGroupHandler.ListGroups/CreateGroup/UpdateGroup/DeleteGroup/CreateOption/UpdateOption/DeleteOption/SetMenuGroups`, `baseOptionHandler.SetMenuBaseOptions`, `memberHandler.List/Lookup/Orders/Create/Update/Delete`, `settingsHandler.Get/GetLogo/Update/PutLogo/DeleteLogo`) verified against the handler files.
- **chi same-path/different-group:** GET `/menus` (open) + POST `/menus` (owner group) coexist via per-method middleware chains — same mechanism the existing discounts split uses.

## Out of scope
UI pages (Plans 2–4). This plan only changes route protection + the proxy allowlist.
