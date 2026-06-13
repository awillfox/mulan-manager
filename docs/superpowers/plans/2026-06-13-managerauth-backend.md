# managerauth Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manager login + opaque bearer-token sessions + role-aware middleware to the Go `mulan` backend, protecting only manager routes (discounts + dashboard for the slice) while leaving POS/agent routes open.

**Architecture:** New feature package `internal/managerauth/{domain,service,http}` following the repo's feature-layered convention. Two additive tables (`manager_users`, `manager_sessions`). Opaque token: client gets a random base64url string; DB stores its SHA-256 hex. Chi middleware validates the bearer, loads the user into request context. `main.go` mounts `/api/auth/*` and wraps the discounts (writes + list) and dashboard route groups with `RequireManager`; `GET /api/discounts/active` stays open for POS.

**Tech Stack:** Go 1.25, chi/v5, pgx/v5, sqlc, Atlas (HCL), bcrypt, crypto/rand + crypto/sha256.

**Working directory for ALL tasks in this plan:** `/home/nate/Dev/mulan` (the backend repo — NOT mulan-manager).

**Preconditions:** `.env` has `PSQL_URL` and `PSQL_DEV_URL`. `atlas`, `sqlc`, `task`, `go` on PATH.

---

### Task 1: Schema — `manager_users` + `manager_sessions`

**Files:**
- Modify: `schema.hcl` (append two tables)
- Modify (generated): `schema.sql` via `task generate-sql-schema`

- [ ] **Step 1: Append the two tables to `schema.hcl`**

Add at the end of `schema.hcl` (before EOF, after the last table):

```hcl
table "manager_users" {
  schema = schema.public

  column "id" {
    type = serial
    null = false
  }
  column "username" {
    type = varchar(50)
    null = false
  }
  column "password_hash" {
    type = varchar(255)
    null = false
  }
  column "name" {
    type = varchar(255)
    null = false
  }
  column "role" {
    type    = varchar(20)
    null    = false
    default = "staff"
  }
  column "active" {
    type    = boolean
    null    = false
    default = true
  }
  column "created_at" {
    type    = timestamptz
    null    = false
    default = sql("now()")
  }
  column "updated_at" {
    type    = timestamptz
    null    = false
    default = sql("now()")
  }

  primary_key {
    columns = [column.id]
  }
  index "manager_users_username_key" {
    columns = [column.username]
    unique  = true
  }
  check "manager_users_role_check" {
    expr = "role IN ('owner', 'staff')"
  }
}

table "manager_sessions" {
  schema = schema.public

  column "id" {
    type = serial
    null = false
  }
  column "manager_user_id" {
    type = integer
    null = false
  }
  column "token_hash" {
    type = varchar(64)
    null = false
  }
  column "expires_at" {
    type = timestamptz
    null = false
  }
  column "created_at" {
    type    = timestamptz
    null    = false
    default = sql("now()")
  }
  column "revoked_at" {
    type = timestamptz
    null = true
  }

  primary_key {
    columns = [column.id]
  }
  index "manager_sessions_token_hash_key" {
    columns = [column.token_hash]
    unique  = true
  }
  index "manager_sessions_user_idx" {
    columns = [column.manager_user_id]
  }
  foreign_key "manager_sessions_user_fk" {
    columns     = [column.manager_user_id]
    ref_columns = [table.manager_users.column.id]
    on_delete   = CASCADE
  }
}
```

- [ ] **Step 2: Apply to the dev DB**

Run: `task migrate-dev`
Expected: Atlas prints a plan that creates `manager_users` and `manager_sessions`, applies without error. (If it prompts to approve, approve.)

- [ ] **Step 3: Verify the tables exist**

Run: `psql "$PSQL_URL" -c "\d manager_users" -c "\d manager_sessions"`
Expected: both tables print with the columns above; `manager_users` shows the unique index on `username` and the role check constraint.

- [ ] **Step 4: Regenerate `schema.sql`**

Run: `task generate-sql-schema`
Expected: `schema.sql` now contains `CREATE TABLE ... manager_users` and `... manager_sessions`. Confirm with `grep -c manager_ schema.sql` → non-zero.

- [ ] **Step 5: Commit**

```bash
git add schema.hcl schema.sql
git commit -m "feat(managerauth): add manager_users and manager_sessions tables"
```

---

### Task 2: sqlc queries

**Files:**
- Create: `internal/sql/managerauth.command.sql`
- Create: `internal/sql/managerauth.query.sql`
- Modify (generated): `sqlc/` via `task sqlcgen`

- [ ] **Step 1: Write the command SQL**

Create `internal/sql/managerauth.command.sql`:

```sql
-- name: CreateManagerUser :one
INSERT INTO manager_users (username, password_hash, name, role)
VALUES ($1, $2, $3, $4)
RETURNING id, username, password_hash, name, role, active, created_at, updated_at;

-- name: CreateManagerSession :one
INSERT INTO manager_sessions (manager_user_id, token_hash, expires_at)
VALUES ($1, $2, $3)
RETURNING id, manager_user_id, token_hash, expires_at, created_at, revoked_at;

-- name: RevokeManagerSession :exec
UPDATE manager_sessions
SET revoked_at = now()
WHERE token_hash = $1 AND revoked_at IS NULL;

-- name: DeleteExpiredManagerSessions :exec
DELETE FROM manager_sessions
WHERE expires_at < now();
```

- [ ] **Step 2: Write the query SQL**

Create `internal/sql/managerauth.query.sql`:

```sql
-- name: GetManagerUserByUsername :one
SELECT id, username, password_hash, name, role, active, created_at, updated_at
FROM manager_users
WHERE username = $1;

-- name: GetManagerSessionWithUser :one
SELECT s.id            AS session_id,
       s.expires_at    AS expires_at,
       s.revoked_at    AS revoked_at,
       u.id            AS user_id,
       u.username      AS username,
       u.name          AS name,
       u.role          AS role,
       u.active        AS active
FROM manager_sessions s
JOIN manager_users u ON u.id = s.manager_user_id
WHERE s.token_hash = $1;
```

- [ ] **Step 3: Regenerate sqlc**

Run: `task sqlcgen`
Expected: no error. New files/types appear: `sqlc/managerauth.command.sql.go`, `sqlc/managerauth.query.sql.go`, with types `ManagerUser`, `ManagerSession`, `CreateManagerUserParams`, `CreateManagerSessionParams`, `GetManagerSessionWithUserRow`.

- [ ] **Step 4: Verify it compiles**

Run: `go build ./...`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add internal/sql/managerauth.command.sql internal/sql/managerauth.query.sql sqlc/
git commit -m "feat(managerauth): sqlc queries for manager users and sessions"
```

---

### Task 3: Domain — roles + token helpers

**Files:**
- Create: `internal/managerauth/domain/managerauth.go`
- Test: `internal/managerauth/domain/managerauth_test.go`

- [ ] **Step 1: Write the failing test**

Create `internal/managerauth/domain/managerauth_test.go`:

```go
package domain

import "testing"

func TestValidRole(t *testing.T) {
	tests := []struct {
		name string
		role string
		want bool
	}{
		{"owner ok", "owner", true},
		{"staff ok", "staff", true},
		{"empty rejected", "", false},
		{"unknown rejected", "admin", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := ValidRole(tc.role); got != tc.want {
				t.Errorf("ValidRole(%q) = %v, want %v", tc.role, got, tc.want)
			}
		})
	}
}

func TestGenerateTokenAndHashAreStable(t *testing.T) {
	tok, err := GenerateToken()
	if err != nil {
		t.Fatalf("GenerateToken: %v", err)
	}
	if len(tok) < 32 {
		t.Errorf("token too short: %d", len(tok))
	}
	h1 := HashToken(tok)
	h2 := HashToken(tok)
	if h1 != h2 {
		t.Errorf("HashToken not stable: %q vs %q", h1, h2)
	}
	if len(h1) != 64 {
		t.Errorf("hash len = %d, want 64 (sha256 hex)", len(h1))
	}
	if h1 == tok {
		t.Errorf("hash must differ from token")
	}
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `go test ./internal/managerauth/domain/`
Expected: FAIL — `undefined: ValidRole` / `GenerateToken` / `HashToken`.

- [ ] **Step 3: Write the implementation**

Create `internal/managerauth/domain/managerauth.go`:

```go
package domain

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
)

// Roles. owner has every permission; staff is the default reduced role.
const (
	RoleOwner = "owner"
	RoleStaff = "staff"
)

// ValidRole reports whether r is a recognised manager role.
func ValidRole(r string) bool {
	return r == RoleOwner || r == RoleStaff
}

// User is the authenticated manager identity carried through the request.
type User struct {
	ID       int32  `json:"id"`
	Username string `json:"username"`
	Name     string `json:"name"`
	Role     string `json:"role"`
}

// GenerateToken returns a fresh, URL-safe opaque session token (32 random
// bytes, base64url, no padding). This is the value handed to the client; only
// its hash is stored server-side.
func GenerateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// HashToken returns the hex SHA-256 of a token. Deterministic: the same token
// always hashes to the same 64-char string, so we can look sessions up by hash
// without ever persisting the raw token.
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `go test ./internal/managerauth/domain/`
Expected: PASS (ok).

- [ ] **Step 5: Commit**

```bash
git add internal/managerauth/domain/
git commit -m "feat(managerauth): domain roles + opaque token helpers"
```

---

### Task 4: Service — login, authenticate, logout, create user

**Files:**
- Create: `internal/managerauth/service/service.go`
- Test: `internal/managerauth/service/service_test.go`

This service depends on `*sqlc.Queries`. The login/authenticate paths are exercised by an integration test that needs a real DB (`PSQL_DEV_URL`); it skips when that env var is absent.

- [ ] **Step 1: Write the implementation**

Create `internal/managerauth/service/service.go`:

```go
package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	"mulan/internal/managerauth/domain"
	"mulan/sqlc"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInvalidSession     = errors.New("invalid or expired session")
	ErrUsernameTaken      = errors.New("username already in use")
	ErrInvalidRole        = errors.New("invalid role")
)

// sessionTTL is how long a freshly minted session stays valid.
const sessionTTL = 30 * 24 * time.Hour

type Service struct {
	q *sqlc.Queries
}

func NewService(q *sqlc.Queries) *Service {
	return &Service{q: q}
}

// Login verifies username+password and, on success, mints a new session.
// Returns the RAW token (shown to the client once) and the session expiry.
func (s *Service) Login(ctx context.Context, username, password string) (domain.User, string, time.Time, error) {
	username = strings.TrimSpace(username)
	u, err := s.q.GetManagerUserByUsername(ctx, username)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, "", time.Time{}, ErrInvalidCredentials
		}
		return domain.User{}, "", time.Time{}, err
	}
	if !u.Active {
		return domain.User{}, "", time.Time{}, ErrInvalidCredentials
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return domain.User{}, "", time.Time{}, ErrInvalidCredentials
	}

	token, err := domain.GenerateToken()
	if err != nil {
		return domain.User{}, "", time.Time{}, err
	}
	expires := time.Now().Add(sessionTTL)
	if _, err := s.q.CreateManagerSession(ctx, sqlc.CreateManagerSessionParams{
		ManagerUserID: u.ID,
		TokenHash:     domain.HashToken(token),
		ExpiresAt:     pgtimestamptz(expires),
	}); err != nil {
		return domain.User{}, "", time.Time{}, err
	}
	return domain.User{ID: u.ID, Username: u.Username, Name: u.Name, Role: u.Role}, token, expires, nil
}

// Authenticate resolves a raw bearer token to the owning user, rejecting
// revoked, expired, or inactive-user sessions.
func (s *Service) Authenticate(ctx context.Context, token string) (domain.User, error) {
	if token == "" {
		return domain.User{}, ErrInvalidSession
	}
	row, err := s.q.GetManagerSessionWithUser(ctx, domain.HashToken(token))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, ErrInvalidSession
		}
		return domain.User{}, err
	}
	if row.RevokedAt.Valid {
		return domain.User{}, ErrInvalidSession
	}
	if !row.ExpiresAt.Valid || row.ExpiresAt.Time.Before(time.Now()) {
		return domain.User{}, ErrInvalidSession
	}
	if !row.Active {
		return domain.User{}, ErrInvalidSession
	}
	return domain.User{ID: row.UserID, Username: row.Username, Name: row.Name, Role: row.Role}, nil
}

// Logout revokes the session backing the given raw token. Idempotent.
func (s *Service) Logout(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	return s.q.RevokeManagerSession(ctx, domain.HashToken(token))
}

// CreateUser provisions a manager account (used by the seed CLI). Validates the
// role and bcrypts the password.
func (s *Service) CreateUser(ctx context.Context, username, password, name, role string) (domain.User, error) {
	username = strings.TrimSpace(username)
	name = strings.TrimSpace(name)
	if !domain.ValidRole(role) {
		return domain.User{}, ErrInvalidRole
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 10)
	if err != nil {
		return domain.User{}, err
	}
	u, err := s.q.CreateManagerUser(ctx, sqlc.CreateManagerUserParams{
		Username:     username,
		PasswordHash: string(hash),
		Name:         name,
		Role:         role,
	})
	if err != nil {
		if strings.Contains(err.Error(), "manager_users_username_key") {
			return domain.User{}, ErrUsernameTaken
		}
		return domain.User{}, err
	}
	return domain.User{ID: u.ID, Username: u.Username, Name: u.Name, Role: u.Role}, nil
}
```

> NOTE: `pgtimestamptz(t)` is a tiny helper converting `time.Time` → `pgtype.Timestamptz`. sqlc with pgx/v5 generates `ExpiresAt pgtype.Timestamptz`. Add the helper in the same file:

```go
// add to internal/managerauth/service/service.go imports: "github.com/jackc/pgx/v5/pgtype"
func pgtimestamptz(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}
```

- [ ] **Step 2: Confirm it compiles**

Run: `go build ./internal/managerauth/...`
Expected: exit 0. If sqlc named the join-row fields differently (e.g. `UserID` vs `ID`), open `sqlc/managerauth.query.sql.go`, read the `GetManagerSessionWithUserRow` struct, and adjust the field references in `Authenticate` to match exactly. (The query aliases are `user_id`, `username`, `name`, `role`, `active`, `expires_at`, `revoked_at` → sqlc fields `UserID`, `Username`, `Name`, `Role`, `Active`, `ExpiresAt`, `RevokedAt`.)

- [ ] **Step 3: Write the integration test**

Create `internal/managerauth/service/service_test.go`:

```go
package service

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"mulan/internal/managerauth/domain"
	"mulan/sqlc"
)

func newTestService(t *testing.T) (*Service, *pgxpool.Pool) {
	t.Helper()
	url := os.Getenv("PSQL_DEV_URL")
	if url == "" {
		t.Skip("PSQL_DEV_URL not set; skipping DB integration test")
	}
	pool, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	return NewService(sqlc.New(pool)), pool
}

func TestLoginAuthenticateLogout(t *testing.T) {
	svc, pool := newTestService(t)
	defer pool.Close()
	ctx := context.Background()

	username := "test_owner_" + time.Now().Format("150405.000000")
	if _, err := svc.CreateUser(ctx, username, "s3cret-pass", "Test Owner", domain.RoleOwner); err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	// wrong password rejected
	if _, _, _, err := svc.Login(ctx, username, "wrong"); err != ErrInvalidCredentials {
		t.Fatalf("Login(wrong) err = %v, want ErrInvalidCredentials", err)
	}

	// correct password mints a session
	user, token, expires, err := svc.Login(ctx, username, "s3cret-pass")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if user.Role != domain.RoleOwner || token == "" || !expires.After(time.Now()) {
		t.Fatalf("bad login result: user=%+v token=%q expires=%v", user, token, expires)
	}

	// token authenticates back to the same user
	got, err := svc.Authenticate(ctx, token)
	if err != nil || got.ID != user.ID {
		t.Fatalf("Authenticate: got %+v err %v", got, err)
	}

	// after logout the token is invalid
	if err := svc.Logout(ctx, token); err != nil {
		t.Fatalf("Logout: %v", err)
	}
	if _, err := svc.Authenticate(ctx, token); err != ErrInvalidSession {
		t.Fatalf("Authenticate after logout err = %v, want ErrInvalidSession", err)
	}

	// garbage token rejected
	if _, err := svc.Authenticate(ctx, "not-a-real-token"); err != ErrInvalidSession {
		t.Fatalf("Authenticate(garbage) err = %v, want ErrInvalidSession", err)
	}
}
```

- [ ] **Step 4: Run the tests**

Run: `PSQL_DEV_URL="$PSQL_DEV_URL" go test ./internal/managerauth/service/ -v` (load `.env` first, e.g. `set -a; . ./.env; set +a`)
Expected: PASS. If `PSQL_DEV_URL` is unset the test SKIPs (still exit 0) — set it to actually exercise the DB path.

- [ ] **Step 5: Commit**

```bash
git add internal/managerauth/service/
git commit -m "feat(managerauth): login/authenticate/logout/create-user service"
```

---

### Task 5: HTTP handler — `/api/auth/login`, `/logout`, `/me`

**Files:**
- Create: `internal/managerauth/http/handler.go`

- [ ] **Step 1: Write the handler**

Create `internal/managerauth/http/handler.go`:

```go
package http

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"mulan/internal/managerauth/domain"
	"mulan/internal/managerauth/service"
	"mulan/internal/response"
)

type Handler struct {
	svc *service.Service
}

func NewHandler(svc *service.Service) *Handler {
	return &Handler{svc: svc}
}

// Routes registers ONLY the public login. Logout + Me require the bearer and are
// registered by main.go inside the RequireManager-protected group.
func (h *Handler) Routes(r chi.Router) {
	r.Post("/login", h.login)
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type loginResponse struct {
	Token     string      `json:"token"`
	ExpiresAt time.Time   `json:"expires_at"`
	User      domain.User `json:"user"`
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid body", err)
		return
	}
	if req.Username == "" || req.Password == "" {
		response.Error(w, r, http.StatusBadRequest, "username and password required", nil)
		return
	}
	user, token, expires, err := h.svc.Login(r.Context(), req.Username, req.Password)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			response.Error(w, r, http.StatusUnauthorized, "invalid credentials", err)
			return
		}
		response.Error(w, r, http.StatusInternalServerError, "login failed", err)
		return
	}
	response.OK(w, r, loginResponse{Token: token, ExpiresAt: expires, User: user})
}

// Logout revokes the caller's current session. Registered under RequireManager.
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	token := BearerToken(r)
	if err := h.svc.Logout(r.Context(), token); err != nil {
		response.Error(w, r, http.StatusInternalServerError, "logout failed", err)
		return
	}
	response.NoContent(w, r)
}

// Me returns the authenticated user pulled from request context by the middleware.
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	user, ok := UserFromContext(r.Context())
	if !ok {
		response.Error(w, r, http.StatusUnauthorized, "not authenticated", nil)
		return
	}
	response.OK(w, r, user)
}
```

> `BearerToken`, `UserFromContext`, and the middleware itself are defined in Task 6 in the same `http` package.

- [ ] **Step 2: Commit (will compile after Task 6)**

Defer commit — this file references middleware helpers added in Task 6. Proceed to Task 6, then build + commit together.

---

### Task 6: Middleware — `RequireManager` + `RequireRole`

**Files:**
- Create: `internal/managerauth/http/middleware.go`
- Test: `internal/managerauth/http/middleware_test.go`

- [ ] **Step 1: Write the middleware**

Create `internal/managerauth/http/middleware.go`:

```go
package http

import (
	"context"
	"net/http"
	"strings"

	"mulan/internal/managerauth/domain"
	"mulan/internal/managerauth/service"
	"mulan/internal/response"
)

type ctxKey int

const userKey ctxKey = 0

// BearerToken extracts the token from an "Authorization: Bearer <token>" header.
// Returns "" when absent or malformed.
func BearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if len(h) > len(prefix) && strings.EqualFold(h[:len(prefix)], prefix) {
		return strings.TrimSpace(h[len(prefix):])
	}
	return ""
}

// UserFromContext returns the authenticated user stored by RequireManager.
func UserFromContext(ctx context.Context) (domain.User, bool) {
	u, ok := ctx.Value(userKey).(domain.User)
	return u, ok
}

// RequireManager validates the bearer token and stores the user in context,
// responding 401 on any failure.
func RequireManager(svc *service.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, err := svc.Authenticate(r.Context(), BearerToken(r))
			if err != nil {
				response.Error(w, r, http.StatusUnauthorized, "authentication required", err)
				return
			}
			ctx := context.WithValue(r.Context(), userKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireRole gates a handler to the listed roles (use AFTER RequireManager).
// Responds 403 when the user's role is not allowed.
func RequireRole(roles ...string) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(roles))
	for _, role := range roles {
		allowed[role] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, ok := UserFromContext(r.Context())
			if !ok || !allowed[user.Role] {
				response.Error(w, r, http.StatusForbidden, "insufficient permissions", nil)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
```

- [ ] **Step 2: Write the failing test (pure helpers, no DB)**

Create `internal/managerauth/http/middleware_test.go`:

```go
package http

import (
	"context"
	"net/http"
	"testing"

	"mulan/internal/managerauth/domain"
)

func TestBearerToken(t *testing.T) {
	tests := []struct {
		name   string
		header string
		want   string
	}{
		{"valid", "Bearer abc.def", "abc.def"},
		{"case-insensitive scheme", "bearer xyz", "xyz"},
		{"no scheme", "abc", ""},
		{"empty", "", ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r, _ := http.NewRequest("GET", "/", nil)
			if tc.header != "" {
				r.Header.Set("Authorization", tc.header)
			}
			if got := BearerToken(r); got != tc.want {
				t.Errorf("BearerToken(%q) = %q, want %q", tc.header, got, tc.want)
			}
		})
	}
}

func TestUserFromContext(t *testing.T) {
	want := domain.User{ID: 7, Username: "owner", Role: domain.RoleOwner}
	ctx := context.WithValue(context.Background(), userKey, want)
	got, ok := UserFromContext(ctx)
	if !ok || got != want {
		t.Errorf("UserFromContext = %+v, %v; want %+v, true", got, ok, want)
	}
	if _, ok := UserFromContext(context.Background()); ok {
		t.Errorf("UserFromContext on empty ctx returned ok=true")
	}
}
```

- [ ] **Step 3: Build the whole package + run tests**

Run: `go build ./internal/managerauth/... && go test ./internal/managerauth/http/ -v`
Expected: build exit 0; tests PASS.

- [ ] **Step 4: Commit (handler + middleware together)**

```bash
git add internal/managerauth/http/
git commit -m "feat(managerauth): auth handler + RequireManager/RequireRole middleware"
```

---

### Task 7: Wire into `main.go` — mount auth, protect discounts + dashboard

**Files:**
- Modify: `main.go` (imports, service construction, routes)

- [ ] **Step 1: Add imports**

In `main.go`, add to the import block (local group):

```go
	managerauthhttp "mulan/internal/managerauth/http"
	managerauthservice "mulan/internal/managerauth/service"
```

- [ ] **Step 2: Construct the service + handler**

After the `discountHandler := ...` line (around `main.go:117`), add:

```go
	managerAuthSvc := managerauthservice.NewService(queries)
	managerAuthHandler := managerauthhttp.NewHandler(managerAuthSvc)
```

- [ ] **Step 3: Mount login (open) and replace the discounts/dashboard routes with protected ones**

In the `r.Route("/api", ...)` block: add the auth route, and REPLACE the existing two lines
`r.Route("/discounts", discountHandler.Routes)` and `r.Route("/dashboard", dashboardHandler.Routes)`
with a split: `/discounts/active` stays open, everything else goes behind `RequireManager`.

Resulting `/api` block (only the changed/added parts shown in place):

```go
	r.Route("/api", func(r chi.Router) {
		// ... existing open routes unchanged (menus, menu-categories, option-groups,
		// options, orders, members, cashiers, settings, cash-drawer, wifi) ...

		// Public auth: login mints a session. (Open.)
		r.Route("/auth", managerAuthHandler.Routes)

		// POS reads the active discount set without auth. (Open — keep BEFORE the
		// protected group so it is not shadowed.)
		r.Get("/discounts/active", discountHandler.ListActive)

		// Manager-only, bearer-protected group.
		r.Group(func(r chi.Router) {
			r.Use(managerauthhttp.RequireManager(managerAuthSvc))

			r.Post("/auth/logout", managerAuthHandler.Logout)
			r.Get("/auth/me", managerAuthHandler.Me)

			r.Route("/discounts", func(r chi.Router) {
				r.Get("/", discountHandler.List)
				r.Post("/", discountHandler.Create)
				r.Patch("/{id}", discountHandler.Update)
				r.Delete("/{id}", discountHandler.Delete)
			})

			r.Route("/dashboard", dashboardHandler.Routes)
		})
	})
```

> IMPORTANT: remove the OLD `r.Route("/discounts", discountHandler.Routes)` and `r.Route("/dashboard", dashboardHandler.Routes)` lines so routes are not double-registered. Leave every other `/api` route exactly as-is — they stay open for POS/agent.

- [ ] **Step 4: Build + run the server**

Run: `set -a; . ./.env; set +a; go build -o /tmp/mulan . && /tmp/mulan` (background it, or use a second shell)
Expected: logs `connected to database` then `server starting on :PORT`, no panic.

- [ ] **Step 5: Verify the wall by hand (before/after observable)**

With the server running (assume `PORT=8080`):

```bash
# POS route still OPEN (no token) — expect 200 + {"data":[...]}
curl -s -o /dev/null -w "active=%{http_code}\n" localhost:8080/api/discounts/active

# Manager route now PROTECTED — expect 401
curl -s -o /dev/null -w "list_noauth=%{http_code}\n" localhost:8080/api/discounts

# Dashboard now PROTECTED — expect 401
curl -s -o /dev/null -w "dash_noauth=%{http_code}\n" localhost:8080/api/dashboard/
```
Expected: `active=200`, `list_noauth=401`, `dash_noauth=401`.

- [ ] **Step 6: Commit**

```bash
git add main.go
git commit -m "feat(managerauth): mount /api/auth, protect discounts + dashboard routes"
```

---

### Task 8: Seed CLI — create the first owner

**Files:**
- Create: `cmd/create-manager-user/main.go`

- [ ] **Step 1: Write the CLI**

Create `cmd/create-manager-user/main.go`:

```go
package main

import (
	"context"
	"flag"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"

	"mulan/internal/config"
	"mulan/internal/managerauth/service"
	"mulan/sqlc"
)

func main() {
	username := flag.String("username", "", "login username")
	password := flag.String("password", "", "password")
	name := flag.String("name", "", "display name")
	role := flag.String("role", "owner", "role: owner|staff")
	flag.Parse()

	if *username == "" || *password == "" || *name == "" {
		log.Fatal("usage: create-manager-user -username U -password P -name N [-role owner|staff]")
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}
	pool, err := pgxpool.New(context.Background(), cfg.PSQLURL)
	if err != nil {
		log.Fatalf("connect db: %v", err)
	}
	defer pool.Close()

	svc := service.NewService(sqlc.New(pool))
	u, err := svc.CreateUser(context.Background(), *username, *password, *name, *role)
	if err != nil {
		log.Fatalf("create user: %v", err)
	}
	log.Printf("created manager user id=%d username=%s role=%s", u.ID, u.Username, u.Role)
}
```

- [ ] **Step 2: Build + run against dev DB**

Run: `set -a; . ./.env; set +a; go run ./cmd/create-manager-user -username owner -password "changeme123" -name "Shop Owner" -role owner`
Expected: logs `created manager user id=1 username=owner role=owner`.

- [ ] **Step 3: End-to-end login check (proves the whole backend slice)**

With the server running:

```bash
TOKEN=$(curl -s localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"owner","password":"changeme123"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
echo "token=${TOKEN:0:12}..."

# protected list now works WITH the token — expect 200
curl -s -o /dev/null -w "list_auth=%{http_code}\n" localhost:8080/api/discounts -H "Authorization: Bearer $TOKEN"

# /me returns the user — expect JSON with role owner
curl -s localhost:8080/api/auth/me -H "Authorization: Bearer $TOKEN"
```
Expected: `list_auth=200`; `/me` returns `{"data":{"id":1,"username":"owner","name":"Shop Owner","role":"owner"}}`.

- [ ] **Step 4: Full test sweep**

Run: `set -a; . ./.env; set +a; go test ./...`
Expected: PASS (managerauth service test exercises the DB path because `.env` is loaded).

- [ ] **Step 5: Commit**

```bash
git add cmd/create-manager-user/
git commit -m "feat(managerauth): CLI to seed a manager user"
```

---

## Self-Review (completed)

- **Spec coverage:** §4 auth (tables T1, queries T2, service T4, handler T5) ✓; opaque hashed token (T3 `HashToken`, T4 stores hash) ✓; `RequireManager`/`RequireRole` (T6) ✓; §5 route cut — discounts writes+list + dashboard protected, `/active` open, all POS routes untouched (T7) ✓; multi-user+roles (role column T1, `ValidRole`/`RequireRole`, seed `-role` T8) ✓; §12 first-owner seeding = CLI (T8) ✓.
- **POS-safety:** T7 step 5 explicitly verifies `/active` stays 200 while protected routes return 401 — the load-bearing risk is checked, not assumed.
- **Type consistency:** `domain.User{ID,Username,Name,Role}` used identically in service, handler, middleware. `HashToken`/`GenerateToken`/`ValidRole` defined T3, consumed T4/T6. sqlc field-name caveat called out in T4 step 2.
- **Open item resolved:** session expiry = fixed 30 days (`sessionTTL`, T4); revisit if sliding expiry wanted later.

## Out of scope (per spec)
No SSE auth, no porting other manager routes, no UI. Frontend lives in the second plan: `2026-06-13-manager-frontend-slice.md`.
