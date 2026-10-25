---
name: vem-new-route
description: Conventions for adding or changing an Express API route in VEM (handler shape, AppError, access model, scopeGuard whitelist RULES, mounting in index.ts, Socket.IO, uploads). Use when creating or editing anything in src/routes or src/middleware.
---

# New or changed API route

1. **Handler shape** (every handler):
   ```ts
   router.get('/:id', async (req: AuthRequest, res, next) => {
     try {
       // …
       res.json({ success: true, data });
     } catch (err) { next(err); }
   });
   ```
   Errors: `throw new AppError('message en français pour l’utilisateur', status)` (`src/utils/AppError.ts`).
2. **Mounting**: a new router goes under `/api/v1/...` in `src/index.ts` with `authMiddleware` per mount (only the public routers are mounted without it). Plans / structure / loading routers also use `requirePlansAccess`.
3. **Access** (`src/middleware/access.ts` is the only place roles become rights): use `req.access`; check a project inside a route with `assertProjectAccess(req, projectId)` (`projectAccess.ts`); filter list endpoints with `await projectWhere(req)` (`auth.ts`). Extra restriction: `requireRole(...)`.
4. **scopeGuard whitelist** (`src/middleware/scopeGuard.ts` `RULES`): if site managers, installers / workers or clients must use the route, add a rule `{ m, p, need: 'read' | 'write', proj: (params) => [projectId…] }` to the module's list (`client: true` only for read routes clients may see; `list: true` for list endpoints filtered in the route). Without a rule they get 403. Full-access roles are not affected.
5. **Sensitive data**: never send identity fields of `/users` to roles other than admin / TM / PM; clients get sanitized handover data only.
6. **Real time**: emit with `io.to('project:<id>')` (exported from `src/index.ts`) when other users should see the change live.
7. **Files**: uploads through `cloudinaryService` (10 MB plan limit; PDF / Office as `raw`); register project files in `project_files` with a category.
8. **AI**: `aiService.anthropicRequest` / `callClaude`, generous `max_tokens`, handle `stop_reason === 'max_tokens'`; numbers shown to users must come from data, not from the model (see `structureAiGuard.ts`).
9. **Frontend callers** (`public/js/*.js`, non-module, shared globals): call through `api(method, path, body)` of `01-core.js`.

Then run `npx tsc --noEmit -p .` (skill `vem-verify`) and document the endpoint in `CLAUDE.md`.
