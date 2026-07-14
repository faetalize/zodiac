# Zodiac AI Agent Instructions

A Vite + TypeScript frontend for Google Gemini and OpenRouter APIs with local-first IndexedDB storage and optional Supabase cloud sync.

Github repo: faetalize/zodiac

## Architecture Overview

### Core Structure

- **Entry point**: [src/main.ts](src/main.ts) bootstraps services and eager-loads all static components
- **Data layer**: Dexie (IndexedDB) in [src/services/Db.service.ts](src/services/Db.service.ts) - local-first with Supabase sync
- **Two component types**:
    - `components/static/*.component.ts` - DOM-bound singletons, auto-loaded at startup via `import.meta.glob`
    - `components/dynamic/*.ts` - Template factories returning HTMLElements (e.g., `messageElement()`)

## Development

```bash
npm install
npm run dev          # Local dev server with SSL
npm run build        # Type-check + production build
npm run sync-db-types  # Sync Supabase types to src/types/database.types.ts
```

### Agent worktree workflow

- Use `npm run create-worktree -- <branch> [worktree-path] [options]` to create a sibling worktree without interactive prompts.
- On Windows, use `npm run create-worktree:win -- <branch> [worktree-path] [options]` for the PowerShell entrypoint.
- For issue-driven work, pass the full conventional branch name, for example `npm run create-worktree -- feature/162-profile-page-responsiveness`.
- The script can create or reuse a local branch, optionally run `npm install`, optionally push with `-u` to the remote, and optionally open a new Alacritty window running `opencode` in the new worktree.
- Run `npm run create-worktree -- --help` for the full flag list and positional argument rules.

### Branch naming

- Supported branch prefixes are `feature/*`, `release/*`, `bugfix/*`, `chore/*`, `hotfix/*`, and `codex/*`.
- Use the prefix that best matches the work. Prefer `bugfix/*` for defects and `chore/*` for maintenance or refactors that do not change user-facing behavior.
- Issue branch names should use `prefix/issue-number-semantic-name`, for example `feature/162-profile-page-responsiveness`.

## Release Cycle

### Branching and deployment flow

- Cloudflare Pages production deployments are pinned to the permanent `production` branch.
- `main` is the ongoing development branch.
- Feature and fix pull requests merge into `main`; do not commit feature work directly to `production`.
- A temporary `release/vX.Y.Z` branch is created from `main` for the version bump and other release-only preparation. Build the in-app changelog from the current draft GitHub Release, polishing and combining its entries into user-facing copy.
- Merge the prepared release branch back into `main` with the `skip-changelog` label on the PR, then promote `main` to `production` through a second pull request.
- Cloudflare deploys the merge into `production`. No release backmerge is needed because release preparation entered `main` before promotion.

### Pull request release classification

- Every pull request targeting `main` must have exactly one release classification label. The merge gate enforces this rule. Promotion pull requests targeting `production` still run the full merge gate but do not need a release classification.
- Use `feature`, `enhancement`, or `bug` for user-facing changes. Write those pull request titles as concise release-note candidates because Release Drafter uses them directly.
- Use `code improvement` for internal refactors, `documentation` for documentation-only work, and `skip-changelog` for release preparation or other administrative changes targeting `main`. These labels are excluded from user-facing release notes.
- Release Drafter runs after merges into `main` and continuously maintains the next draft GitHub Release from included pull requests. The draft targets `production` so publishing it after deployment tags the deployed branch.

### Pro request edge function slots

- The frontend targets the premium chat edge function through `PRO_REQUEST_FUNCTION_NAME` / `PRO_REQUEST_ENDPOINT` in [src/services/Supabase.service.ts](src/services/Supabase.service.ts).
- Available Supabase function slots are `handle-pro-request`, `handle-pro-request-x`, and `handle-pro-request-test`.
- `handle-pro-request` and `handle-pro-request-x` are equivalent rotating production slots. The currently released frontend points at one slot, while the other slot is available for the next synced frontend/backend release.
- Only change the committed `PRO_REQUEST_FUNCTION_NAME` target as part of a new release workflow. Do not change the production target for ordinary feature work, fixes, local testing, or short-lived validation.
- When a frontend/backend sync release is required, deploy the backend update to the production slot that the currently released frontend is not using, update `PRO_REQUEST_FUNCTION_NAME` to point the new frontend bundle at that slot, then deploy the frontend. This keeps old loaded clients on the old function and new clients on the new function.
- Use `handle-pro-request-test` for quick backend iteration and local/manual validation. Point `PRO_REQUEST_FUNCTION_NAME` at the test slot only for local test builds or short-lived validation branches; do not promote a release to `production` while it points at the test slot.
- Before changing the production target, verify every premium caller uses `PRO_REQUEST_ENDPOINT` rather than hardcoding a function URL.

### Preparing a new release

- Open the continuously maintained draft GitHub Release before creating the release branch. Its categorized entries are the release-note candidates collected since the previous published release.
- Create `release/vX.Y.Z` from `main`, then polish the draft entries into the final user-facing copy. Combine related pull requests and remove implementation detail rather than reconstructing the release from commit history.
- Update the user-facing changelog in [src/index.html](src/index.html) under the `#whats-new` section.
- Update the version string in [src/utils/helpers.ts](src/utils/helpers.ts) so the badge and changelog header display the new version.
- Update the draft GitHub Release to mirror the final in-app changelog.
- Merge the release branch into `main`, promote `main` to `production`, and verify the Cloudflare deployment before publishing the draft.

### How to build the changelog well

- The in-app changelog is user-facing marketing/product copy, not a technical document.
- Summarize released value, not implementation details. Prefer feature outcomes and user benefits over commit-level mechanics.
- Do not mention developer-only infrastructure or internal workflow changes unless they directly affect Zodiac users.
- Favor broad, human phrasing such as `RPG group chat stability improvements` over overly granular engineering detail.
- When a shipped feature is genuinely user-visible, name it clearly (for example, `Message debug tools`) instead of hiding it behind vague wording.
- Good entries should feel like release notes written for users: concise, readable, and slightly polished rather than deeply technical.

### Tagging guidance

- Release tags must point at the exact commit deployed from `production`.
- Do not create or publish the tag while either the release-preparation PR into `main` or the promotion PR into `production` is still open.
- Verify the Cloudflare production deployment first, then publish the draft GitHub Release. Its `production` target creates the `vX.Y.Z` tag at the deployed branch head.

### Creating the GitHub Release

- Release Drafter creates and maintains the upcoming GitHub Release as a draft; do not create a second release manually.
- Publish the existing draft only after `main` has been promoted to `production` and the Cloudflare deployment has been verified.
- Confirm that the draft targets `production` and that its version tag matches the version in [src/utils/helpers.ts](src/utils/helpers.ts).
- Title the release to match that version tag (for example, `v1.8.5`).
- The GitHub Release notes should mirror the in-app changelog from the `#whats-new` section in [src/index.html](src/index.html). Do not use raw PR titles or commit messages.
- Reformat the changelog entries as a Markdown list under a `## What's New` heading, keeping the same user-facing, product-focused phrasing (bold the feature name, then the benefit):

    ```markdown
    ## What's New

    - **Richer model picker:** Browse models by provider family, search faster, and pin favorites for quicker access.
    - **More model choices:** New OpenRouter options are available, including expanded Gemini, Grok, Qwen, DeepSeek, and Inception models.
    ```

- Publish the prepared draft with `gh release edit <tag> --draft=false --latest`, after confirming its title, notes, and `production` target.

## Conventions

### Abstraction Style

- Do not add getter/helper functions around simple exported arrays, constants, or direct property access. Prefer filtering, finding, and reading exported data directly at the call site when the backing logic is simple.
- Only introduce service-style getters when there is real backing complexity: async state, caching, persistence, authorization, normalization shared across many call sites, or a non-trivial source that benefits from an explicit boundary.
- Example: prefer `IMAGE_MODELS.find((model) => model.id === selectedModel)?.maxInputImages` over a `getImageModelDefinition(selectedModel)` wrapper when `IMAGE_MODELS` is just an exported array.

### Component Pattern

Static components query DOM elements at module load and throw if missing:

```typescript
// src/components/static/Example.component.ts
const element = document.querySelector<HTMLButtonElement>("#my-button");
if (!element) throw new Error("Missing DOM element: #my-button");

element.addEventListener("click", () => {
	/* handler */
});
export { element };
```

### Cross-Component Communication

Use `CustomEvent` on `window` or `document` for decoupled messaging:

```typescript
// Emit
window.dispatchEvent(new CustomEvent("generation-state-changed", { detail: { isGenerating: true } }));

// Listen
window.addEventListener("generation-state-changed", (e) => {
	/* handle */
});
```

Key events: `auth-state-changed`, `generation-state-changed`, `chat-model-changed`, `subscription-updated`, `round-state-changed`

### Service Initialization

Services export an `initialize()` function called from `main.ts` in dependency order. Avoid circular imports by using event-based communication.

### Overlay And Surface Layers

- Use [src/services/Overlay.service.ts](src/services/Overlay.service.ts) for true app-level overlays: full-screen flows that intentionally blur/take over the app and use the overlay back button, such as auth, onboarding, changelog, persona forms, and debug modals already hosted in `.overlay-content`.
- Use [src/services/Surface.service.ts](src/services/Surface.service.ts) for transient floating surfaces that should not inherit overlay blur or the back button, such as adaptive sheets, lightweight editors, and contextual task surfaces.
- `#surface-plane` is always mounted and should not be hidden with `display: none`; it is click-through by default (`pointer-events: none`) while hosted surfaces opt back into pointer handling.
- Adaptive sheets belong on `#surface-plane` and should use the `adaptive-sheet` class. They present as compact modal-like surfaces on desktop and slide up as bottom sheets on mobile.
- Prefer `surfaceService.show("element-id")` / `surfaceService.close("element-id")` for adaptive sheets instead of `overlayService.show()` / `overlayService.closeOverlay()`.
- Keep feature-specific state resets in the feature component. `Surface.service.ts` dispatches `surface-closed` on the surface element after the close animation completes.

### Dropdown Menus

- Prefer [src/utils/dropdownPortal.ts](src/utils/dropdownPortal.ts) for `.dropdown-menu` elements that open inside the sidebar or other blurred surfaces.
- The sidebar uses `backdrop-filter`; nested dropdowns with their own `backdrop-filter` can blur the sidebar's already-flattened backdrop instead of the real content behind the menu, which makes the menu look foggy rather than properly blurred.
- `openDropdownPortal(menu, anchor)` temporarily moves the menu to `document.body`, positions it from the anchor's `getBoundingClientRect()`, closes it on scroll/resize, and restores it to its original parent on close.
- Keep dropdown-specific open state in the owning component, and use the portal `onClose` callback to reset ARIA/state when the helper closes the menu externally.

### Database Migrations

Dexie schema versions in `Db.service.ts` are additive. Use `.upgrade()` for data migrations:

```typescript
db.version(N)
	.stores({
		/* schema */
	})
	.upgrade(async (tx) => {
		/* migrate */
	});
```

### Settings Persistence

User preferences use `localStorage` with service-level get/set wrappers. See [src/services/Settings.service.ts](src/services/Settings.service.ts).

### Test Scope And Failure Mapping

- Treat tests as three explicit layers:
- Type 1: pure logic/unit tests. These can mock freely and should not make UI behavior claims.
- Type 2: service/state integration tests. Use these for app-owned rules and invariants without claiming real browser behavior. Good examples: deleting the correct chat record, editing message `content[231]` without shifting other indices, pruning the correct tail on regenerate, or building the correct final payload at the cloud-sync boundary.
- Type 3: feature/user-story tests. Use these when any real UI behavior matters. These should use the real component, real DOM wiring, and real user-triggered entrypoint wherever practical.
- Default split: if the behavior under test involves the UI at all, use Playwright. If the behavior under test is state/persistence logic and does not need real UI behavior, use Vitest.
- In practice, use Playwright for things like sidebar deletion, visible message editing controls, drag/drop, scrolling, loading older messages, abort-generation, selection/focus behavior, and end-to-end persistence after reload.
- In practice, use Vitest for things like message index correctness, chat persistence invariants, regenerate/prune state rules, sync payload construction, and other logic where the main risk is incorrect state rather than incorrect browser behavior.
- Do not force Vitest/JSDOM to stand in for full browser fidelity when the main risk is real browser behavior. If a feature story depends on focus, selection, drag/drop, scrolling, async DOM timing, reload behavior, or broad app-shell wiring, prefer Playwright over a heavily simulated JSDOM setup.
- Default to using the real existing component/element unless there is a concrete reason to mock it, such as unsupported browser behavior, meaningfully harder setup, substantial test slowdown, or unrelated failure modes.
- If the user asks to test a feature, user story, live behavior, or a reported UI bug, default to a Type 3 test unless they explicitly ask for a lower-layer test.
- Most Zodiac feature-level tests should be Type 3. Use Type 1 and Type 2 tests to support targeted logic and service coverage, not as substitutes for feature behavior coverage.
- Use Playwright for the highest-value user stories and browser-fidelity risks. In Zodiac this especially includes chat creation/selection flows, deleting selected vs unselected chats, attachment drag/drop, abort-generation behavior, and cloud-sync-critical stories.
- Use Vitest for logic, state integrity, message index correctness, persistence behavior, and targeted integrations where browser fidelity is not the main uncertainty.
- JSDOM is allowed for narrow render-contract checks only. Good examples: `messageElement(message)` renders a `.message`, includes the edit button for user messages, shows a reasoning block when `thinking` exists, or renders an attachment preview node. Do not present those tests as proof that the live UI flow works.
- If making a JSDOM test requires rebuilding large parts of the browser environment or app shell just to exercise the user story, treat that as a signal to switch to Playwright instead of continuing to add harness complexity.
- Name tests so their primary failure reason matches the behavior under test.
- For CRUD or state-transition tests, prioritize assertions about persisted state, current in-memory state, and coarse DOM outcomes such as element presence, selection state, or removal from the list.
- Do not make a `create`, `edit`, or `delete` test fail only because an internal child selector or styling hook changed unless that internal structure is the behavior being tested.
- If a DOM structure is itself important, write a separate render-contract test for it, for example `renders a complete persona sidebar card`.
- When a regression should be caught by a specific selector, class, or subtree shape, make that selector part of a dedicated rendering test instead of coupling unrelated behavioral tests to the same detail.
- When the user asks for a test of live app behavior or reports a UI bug, do not mock the UI/component layer whose behavior is under test. Prefer the real component, real DOM wiring, and the real user-triggered entrypoint.
- Prefer reproducing the actual user timeline over seeding an end-state that merely resembles it. If a bug happens after a live sequence of sends, skips, scrolls, or clicks, the test should create that sequence the same way.
- Be explicit about the layer a test covers. If a test mocks a renderer or other boundary, do not present it as proof of real DOM behavior.
- For stateful UI bugs, assert both backing state and visible DOM state, and ensure the assertion can catch them diverging in-session.
- For bug-reproduction tests, make the first failing assertion describe the user-visible symptom as directly as possible so another agent can tell what is broken from the failure output.
- Many Zodiac features are cloud-sync-aware, so feature behavior may depend on remote Supabase-backed state instead of only local Dexie state.
- When adding tests for a feature, assess whether the cloud-sync path is meaningfully different and worth covering. If that tradeoff is unclear, discuss it with the user instead of guessing.
- Distinguish between cloud-sync-aware feature tests and sync-implementation tests.
- Cloud-sync-aware feature tests ask: `does the app use sync correctly for this feature?` Examples: deleting a synced chat, editing a synced message, or regenerating a synced conversation tail while preserving the correct app state.
- Sync-implementation tests ask: `does the sync layer itself perform the correct remote work?` Examples: `deleteSyncedChat()` marks the correct remote chat deleted, marks the correct remote message rows deleted, triggers blob cleanup for the right blobs, and queues retries correctly on failure.
- A cloud-sync variant means coverage for behavior that differs when app state arrives through the cloud-sync restore boundary. It does not automatically mean a live Supabase or end-to-end backend test.
- If decrypted synced data is already correctly applied to localStorage, IndexedDB, or an app service boundary, and the risk is frontend rehydration, component state, or event wiring, use a local integration/component test with a simulated or mocked sync boundary.
- Use live Supabase or end-to-end backend coverage only when the behavior under test is the sync implementation itself: remote persistence, encryption/decryption, RLS, migrations, Supabase queries, or real cross-device data flow.
- Do not collapse those two responsibilities into one test unless there is a specific reason. Feature tests should usually mock the sync boundary. Sync-layer tests should exercise `Sync.service.ts` behavior directly.
- When you add or revise a test, include a short explicit note in your final response stating whether a Supabase/cloud-sync variant is worth adding for that test and why.
- When adding cloud-sync variants of tests, prefer exercising the remote-aware app path with clear contract-shaped fixtures or mocks at the sync boundary rather than duplicating the full backend implementation in tests.

### Workflow Notes

- After every code or file change, end the final response with a short `Should we commit this?` section that considers the full current worktree, including any earlier uncommitted changes, and answers yes or no with a brief reason.

### Styling

- **Custom CSS** - Hand-written styles in `src/styles/main.css`, `src/styles/dark.css`, `src/styles/light.css`
- **Tailwind base reset** - `@import "tailwindcss"` in main.css for normalization only (no utility classes used)
- **Dynamic theming** - CSS custom properties in `src/styles/themes/{color}-{mode}.css` (e.g., `blue-dark.css`)
- **No utility classes** - HTML uses semantic class names, not Tailwind utilities

## External Dependencies

- **@google/genai** - Gemini SDK for chat and image generation
- **@supabase/supabase-js** - Auth, database, realtime subscriptions
- **Dexie** - IndexedDB wrapper with migrations
- **marked + DOMPurify** - Markdown rendering with XSS protection
- **highlight.js** - Code syntax highlighting

## Common Patterns

### Adding a New Static Component

1. Create `src/components/static/MyComponent.component.ts`
2. Query required DOM elements, throw on missing
3. Export any needed functions/state
4. Add corresponding HTML element to `src/index.html`
5. Component auto-loads via glob import in `main.ts`

### Adding a Model Message Type

1. Extend `Message` interface in [src/types/Message.ts](src/types/Message.ts)
2. Update rendering in [src/components/dynamic/message.ts](src/components/dynamic/message.ts)
3. Handle in API processing in `Message.service.ts`

### Image Models And LoRA Support

- Image models are defined in [src/constants/ImageModels.ts](src/constants/ImageModels.ts). A model supports LoRAs only if its definition sets `loraArchitecture` (a Runware model-upload architecture value, e.g. `"illustrious"`, `"sdxl"`).
- LoRA support is ultimately gated by Runware, not by us or Civitai: to upload user LoRAs, the architecture must exist in Runware's model-upload `architecture` enum, and the model itself must accept LoRAs on Runware. This is a per-model fact — check Runware's docs; don't assume from how the model is hosted. The current Alibaba/ByteDance-hosted Qwen and Seedream models do not support LoRAs.
- Which Civitai LoRAs are accepted is decided by the hardcoded allowlist in [src/constants/Loras.ts](src/constants/Loras.ts), mapping exact Civitai `BaseModel` strings to Runware architectures. `Lora.service.add` rejects LoRAs whose base model is not in the table. The backend has an identical table in `zozo-edge/supabase/functions/handle-max-request/index.ts` — keep the two in sync.
- Matching is strict (exact strings, same architecture only). Do not add cross-family entries (e.g. Pony on Illustrious) unless explicitly requested.
- To add a LoRA-capable model: (1) verify the architecture exists on Runware and the checkpoint is Runware-hosted open weights — if not, stop, it cannot be supported; (2) get exact Civitai strings from `civitai.com/api/v1/enums` (`.BaseModel`); (3) extend the `LoraArchitecture` union in [src/types/ImageModels.ts](src/types/ImageModels.ts), set `loraArchitecture` on the model definition, add the entries to `Loras.ts`; (4) make the matching backend changes in zozo-edge.
- LoRAs never block generation: the backend skips incompatible or unsupported LoRAs with a warning instead of failing the request.

### Supabase Types

After schema changes, run `npm run sync-db-types` to regenerate [src/types/database.types.ts](src/types/database.types.ts).

### Supabase Dashboard Edge Function Quirk

- The current deployment flow uses the Supabase Dashboard for individual edge functions in `zozo-edge/functions/`.
- Do not rely on shared sibling folders like `functions/_shared/` or cross-function relative imports for deployable code.
- Keep any required helpers/constants inside each deployed function file unless the user explicitly confirms a bundling/deploy process that supports shared files.
