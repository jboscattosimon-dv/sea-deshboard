# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm start` — run the server (`node server.js`; reads `.env` for `SUPABASE_URL`, `SUPABASE_KEY`, `JWT_SECRET`, `PORT`).
- `npm run dev` — run with `nodemon` for auto-restart.
- No lint, build, or test scripts are configured. There is no test suite.
- Database changes are applied by hand: open the relevant `.sql` file in `scripts/` (or `database.sql` for the original schema) and run it in the Supabase SQL Editor. There is no migration runner/ORM — Supabase is accessed only via `@supabase/supabase-js` as a Postgres + Storage client.

## Architecture

**Two separate front ends, one Express backend.**
- `index.html` — the internal staff dashboard. A single ~7,500-line file: all CSS and JS are inline, no bundler/framework/build step. Each "page" is a `<div class="page" id="page-X">` toggled by `goTo(page)` (no URL routing/history). Data fetching goes through a small `API` object (`API.get/post/put/patch/del`, JWT read from `localStorage['sea_token']`) plus a `STORE`/`localStorage` cache populated by `loadFromAPI()`.
- `portal.html` — a separate SPA for the agency's actual clients (not staff), served at `/portal`, authenticated independently via `middleware/portal-auth.js` (JWT with `tipo: 'cliente'`). Don't confuse this with staff/`usuarios` auth.
- `server.js` mounts one router per domain from `routes/`, each file self-contained (`router.use(authMiddleware)` at the top, plain `{ erro }` JSON error shape on failure).

**Auth is fully custom, not Supabase Auth.** Supabase is used only as a Postgres+Storage client (`supabase.js`, keyed by the **anon key** in `SUPABASE_KEY`). Staff login (`routes/auth.js`) checks `usuarios.senha_hash` with bcrypt and issues its own JWT (`{ id, nome, papel }`, verified by `middleware/auth.js`). There's no `auth.uid()`/Supabase-session tie-in.

**Permissions are enforced only in the front end.** `usuarios.papel` is `'admin'` or `'user'`; `usuarios.permissoes` is a per-page `{ visualizar, editar }` JSON blob edited in Users → Permissions. `canView(page)`/`canEdit(page)` in `index.html` gate nav items, buttons, and page access — `papel === 'admin'` bypasses all checks. Backend routes only require a valid JWT (`authMiddleware`); they do not re-check `papel`/`permissoes`. Follow this existing pattern for new modules rather than adding per-route authorization — a stricter backend-only check would be inconsistent with every other route in the app.

**Row Level Security must be explicitly disabled on new tables.** The access-control model above assumes RLS is off (the anon key is trusted). Supabase auto-enables RLS on tables created via the SQL Editor; any new table needs `ALTER TABLE ... DISABLE ROW LEVEL SECURITY;` in its migration script, or every insert/update fails with "new row violates row-level security policy".

**Two ID conventions coexist**, depending on when a table was added:
- Older tables (`clientes`, `demandas`, `status`, `historico`, ...) use `TEXT` primary keys with a short prefix generated in SQL or in the route handler (`'c_' || substr(md5(random()::text), 1, 8)`, `'h_' + Math.random().toString(36)...`, etc.).
- Everything added later (`crm_*`, `sdr_*`, `portal_*`, `jornada_*`, `onboarding_*`) uses `UUID DEFAULT gen_random_uuid()`. Match whichever convention the tables you're touching already use.

**Feature modules follow a copy-paste pattern, not a shared abstraction.** Each domain (CRM, SDR, Calendário, Portal do Cliente, Onboarding, ...) is one `routes/<name>.js` file plus a self-contained slice of `index.html` (its own `page-<name>` div(s), `modal-<name>` overlay(s), render functions, and matching entries in `goTo()`'s dispatch table, `buildHeaderActions()`, and `applyPermissions()`/`canView`/`canEdit`'s page-key lists). There is no shared CRUD/page generator — when adding a module, find the most similar existing one and mirror its structure (reuse the `.btn`/`.modal`/`.badge`/`.table-wrap`/`.progress-track` CSS classes, the `API` object, `toast()`, `openModal()/closeModal()`, and the native HTML5 drag-and-drop reorder pattern used by SDR and Onboarding — don't introduce a new UI library or drag-and-drop dependency).

**`routes/jornada.js` and `jornada.html` are legacy/unmounted.** They implemented an earlier, hardcoded 4-phase onboarding flow. They were superseded by the generic `routes/onboarding.js` module (Modelos → Etapas → Tarefas) and are no longer wired into `server.js` or `index.html`'s nav, but the files and their `jornada_*` tables were intentionally left in place rather than deleted.
