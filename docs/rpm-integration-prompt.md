# Prompt: Integrate RPM ("Readout Pattern") into SIREN's Hub

This is a ready-to-paste prompt for a separate Claude Code session that has access to
RPM's codebase and to a running SIREN instance. It covers two jobs:

1. **Build RPM's own API** so it implements SIREN's Observer contract v2
   (see `docs/siren-artifact-hub-design.md` §19.2 for the full spec this is derived from).
2. **Register RPM in the running SIREN app and link it to real projects/deliverables**
   — actually calling the endpoints below against SIREN, not just reading about them.

Everything below is written to be handed to that session verbatim.

---

## Context you need before starting

RPM is an existing service, external to SIREN, that produces an artifact type called
**Readout Pattern**. SIREN wants to observe RPM's data (never own it) through four
read-only HTTP GET endpoints that RPM must add. SIREN polls these live — there is no
push from RPM, and no background sync job; SIREN calls them (a) when a user opens a
linked artifact's detail panel, and (b) once, synchronously, at the moment someone
clicks "Release" on the SIREN workflow that contains the linked artifact.

RPM's actual behavior, as described by the person running this integration:

- **Permission model**: every user has **view** access to **every** project in RPM,
  unconditionally — there is no view-level gating at all. **Edit** access is scoped
  per project via a member list. RPM internally has two roles on that list, `master`
  and `editor` — `master` can additionally edit the project's own settings, but for
  artifact-level purposes (reading/writing a Readout Pattern) the two roles are
  **equivalent**. Treat both as edit access.
- **Versioning model**: RPM has exactly two write actions.
  - **Snapshot** — captures the full artifact state. This is RPM's release-equivalent:
    treat every snapshot as `isReleased: true`. Snapshots are the *only* addressable,
    versioned state RPM has.
  - **Save** — a plain **overwrite**. No minor-version history is kept, and **no
    comment/note is captured on save**. Because nothing addressable survives a save,
    it produces **no version record at all** for the Observer contract — the contract
    only ever sees snapshots.
- **No audit log in RPM itself.** RPM does not log who changed what or when. However,
  the organization runs a **shared common backend** across all of its internal
  services, and that backend logs save/release-type actions from every service
  (RPM included) into its own DB — but with a **very limited field set**: updated
  user, date, and project name only. Use it as a **best-effort** source for
  `giverKnoxId` / `observedAt` on a snapshot record; if no matching log entry exists,
  leave those fields `null` rather than guessing.

---

## Part 1 — Build the 4 endpoints in RPM

All four are **GET**, all live under one base URL you'll register with SIREN as
`baseUrl`. SIREN calls them with a 5-second timeout and treats any non-2xx response,
timeout, or malformed body as "no data" (fail-closed) — so respond quickly and
return `200` with real computed values rather than `403`; RPM's own view model has no
concept of "forbidden" to begin with (view is unconditional).

The `knoxId` query parameter is the requester's identity — assume it's the same
corporate KnoxID SIREN and the rest of your organization's services already share. If
`knoxId` is missing or unrecognized, fail closed: `canView: false, canEdit: false`,
and treat the caller as having no visibility for the other three endpoints too.

### 1. `GET /artifacts/{artifactId}/access?knoxId={requester}`

Returns the requester's access to one Readout Pattern artifact.

```json
{ "canView": true, "canEdit": false }
```

- `canView`: `true` whenever `knoxId` is a recognized user — RPM has no view gating.
- `canEdit`: `true` iff `knoxId` is on the owning project's member list as `master`
  or `editor`. Otherwise `false`.

### 2. `GET /artifacts/{artifactId}/current-version?knoxId={requester}`

Returns the **latest snapshot** of the artifact, or nothing if none exists yet (an
artifact that has only ever been *saved*, never *snapshotted*, has no addressable
version — respond `404` or `null`, not a fabricated entry for the unsaved state).

```json
{
  "versionLabel": "2024-06-03T09:14:00Z",
  "isReleased": true,
  "giverKnoxId": "jdoe",
  "giverDept": null,
  "viewUrl": "https://rpm.internal.example.com/patterns/PAT-4471",
  "sourceRefs": [],
  "editors": ["jdoe", "asmith"],
  "observedAt": "2024-06-03T09:14:00Z"
}
```

Field notes:
- `versionLabel`: any stable, human-legible label for the snapshot — a timestamp is
  fine since RPM has no version-number concept. Whatever you pick, it must be stable
  for that snapshot (SIREN freezes it verbatim into a release later).
- `isReleased`: always `true` — every value this endpoint or `versions` returns
  is a snapshot, and every snapshot is release-equivalent by definition.
- `giverKnoxId` / `observedAt`: pulled from the shared common-backend log entry for
  this project's most recent snapshot action, if one exists; `null` otherwise. Do not
  fall back to "whoever called snapshot right now" — only the log's recorded value.
- `giverDept`: RPM doesn't track department; always `null`.
- `viewUrl`: a working deep link into RPM for this artifact.
- `sourceRefs`: `[]` — Readout Pattern isn't built from another Hub-tracked artifact.
  Leave this empty unless that changes.
- `editors`: **only populate when `canEdit` would be `true` for this `knoxId`** — i.e.
  when the requester is themselves `master` or `editor` on the owning project. If they
  only have view access, return `null` here, not an empty array (this is the signal
  SIREN's UI uses to show/hide the editor list). When populated, list every `master`
  and `editor` KnoxID on the project (no need to distinguish the two roles here).

### 3. `GET /artifacts/{artifactId}/versions?knoxId={requester}`

Same shape as `current-version`, as a JSON array, most recent first — every entry is
a snapshot (`isReleased: true` on all of them; RPM has no working/unreleased state).
If the artifact has never been snapshotted, return `[]`.

```json
[
  { "versionLabel": "2024-06-03T09:14:00Z", "isReleased": true, "...": "..." },
  { "versionLabel": "2024-05-18T14:02:11Z", "isReleased": true, "...": "..." }
]
```

Apply the same `knoxId`-based filtering as `access`/`current-version` — SIREN trusts
this list completely and does **not** re-filter or re-mask it. If the caller has no
view access (shouldn't normally happen given RPM's model, but handle it defensively),
return `[]`.

### 4. `GET /projects/search?code={code}&revision={revision}`

This is the **project-linking** endpoint — see the mapping requirement below for why
it exists and why it must never be collapsed to one result.

```json
[
  { "externalProjectId": "proj_8f2a1c", "displayName": "PLL_MAIN rev.B (foundry run 2)", "code": "PLL_MAIN", "revision": "B" },
  { "externalProjectId": "proj_c91e07", "displayName": "PLL_MAIN rev.B (internal test)", "code": "PLL_MAIN", "revision": "B" }
]
```

- Match RPM projects whose own `code` (and `revision`, when given) equal the query
  params, using whatever matching RPM already does internally for project code/rev
  fields.
- **`externalProjectId` must be RPM's real internal key or UUID for that project —
  never its display name.** RPM allows multiple distinct projects to share the same
  `code` + `revision` (e.g. a production run and a parallel internal test both called
  `PLL_MAIN` rev `B`), so the display name is not a safe identifier. Return every
  matching project as its own array entry, each carrying its own real, unique
  `externalProjectId`, even when several entries share the same `code`/`revision`
  and look identical to a person skimming the list.
- `displayName` should carry enough extra context (project title, a short
  disambiguating note, whatever RPM has) that a human picking from a short list of
  otherwise-identical `code`/`revision` matches can actually tell them apart.
- If nothing matches, return `[]`. Never guess or auto-collapse to "the most likely
  one" — SIREN always shows this list to a person and requires an explicit pick, even
  when there's only one candidate.

---

## Part 2 — Register RPM in the running SIREN app

Once the four endpoints above are live at some `<RPM_BASE_URL>`, do the following
against the actual running SIREN instance (not a mock) — these are real writes.

### 2.1 Register RPM as a Hub service

```
POST /hub/services
Headers: X-Knox-Id: <an Admin user's KnoxID>, X-User-Group: Admin
Body:
{
  "name": "RPM",
  "description": "Readout pattern management",
  "defaultTier": "A",
  "transport": "http",
  "baseUrl": "<RPM_BASE_URL>",
  "viewUrlTemplate": "<RPM_BASE_URL_OR_UI_URL>/patterns/{artifactId}",
  "artifactTypes": [
    { "key": "readout-pattern", "name": "Readout Pattern" }
  ]
}
```

- `defaultTier: "A"` and `transport: "http"` are required together — SIREN locks
  `transport` to `"none"` for any other tier, so this must be exactly `"A"`/`"http"`.
- The `artifactTypes` entry is optional (RPM only produces one kind of artifact today,
  so SIREN would treat it as a single-type service even with an empty list) but is
  recommended for consistency with other multi-type-capable services and to leave
  room for RPM adding more artifact types later without a breaking change.
- The response includes a server-generated, immutable `key` — record it, e.g.
  `"a1b2c3d4_rpm"`. Every step below refers to it as `<RPM_SERVICE_KEY>`.

### 2.2 Link a SIREN project to the correct RPM project

For each SIREN `Project` (identified by its `code` + `revision`) that should pull
Readout Pattern data from RPM:

```
GET /hub/services/<RPM_SERVICE_KEY>/projects/search?code=<project.code>&revision=<project.revision>
```

Inspect the returned candidates. **A human must pick the correct one by its
`externalProjectId`** — never auto-select, even if there is exactly one candidate.
This is the same code+revision-not-always-unique concern the endpoint above exists
to solve; SIREN enforces the human-confirmation step for exactly this reason.

Then create the link:

```
POST /projects/<siren_project_id>/service-links
Headers: X-Knox-Id: <an Admin user's KnoxID>, X-User-Group: Admin
Body:
{
  "serviceKey": "<RPM_SERVICE_KEY>",
  "externalProjectId": "<the confirmed candidate's externalProjectId>",
  "displayName": "<optional human-readable label, e.g. what you saw in the search result>"
}
```

(`GET /projects/<siren_project_id>/service-links` lists existing links if you need to
check what's already there; `DELETE .../service-links/<linkId>` removes one.)

### 2.3 Link an actual deliverable to a real RPM artifact

On the SIREN workflow canvas (or via `PATCH /deliverables/:id`), set:

- `serviceKey`: `<RPM_SERVICE_KEY>`
- `externalArtifactId`: the specific Readout Pattern's real RPM artifact id/uuid
  (**not** the project id — this is the artifact-level identifier the four Part-1
  endpoints above take as `{artifactId}`)
- `artifactTypeKey`: `"readout-pattern"`, if you registered the `artifactTypes` entry
  in step 2.1; omit/leave `null` otherwise.

**Only pick `externalArtifactId` values that belong to the RPM project you linked in
2.2 for that SIREN project.** SIREN does not itself enforce that an artifact ID
belongs to a linked project (RPM's `access`/`current-version`/`versions` endpoints are
the real enforcement point, since SIREN trusts their filtering completely) — so this
is a manual discipline point when wiring up test data, not something to skip because
"it'll work anyway."

---

## Part 3 — Verify it end to end

Once wired up, confirm:

- Opening the linked deliverable's detail panel as a project member with no `master`/
  `editor` role shows **view-only**: released (snapshot) versions only, no edit
  affordances, no editors list.
- Opening it as a `master` or `editor` shows the full snapshot history and the
  editors list.
- An artifact that has only been **saved**, never **snapshotted**, shows no version
  at all in SIREN (not an empty "working copy" — genuinely nothing, since save
  produces no addressable state).
- After taking a snapshot in RPM, the new version appears via `current-version`
  immediately (SIREN calls this live, not on a delay) — but note it will **not**
  automatically appear as a "release" inside SIREN until someone actually clicks
  Release on the containing SIREN workflow (that's the one moment SIREN calls RPM to
  freeze a version into its own release snapshot).
- `GET /projects/search` with a `code`/`revision` pair that matches two or more
  distinct RPM projects returns them as separate entries with distinct
  `externalProjectId`s — confirm the SIREN admin UI shows them as distinct, pickable
  options rather than silently deduping.
