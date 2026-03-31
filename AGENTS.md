# Zodiac AI Agent Instructions

A Vite + TypeScript frontend for Google Gemini and OpenRouter APIs with local-first IndexedDB storage and optional Supabase cloud sync.

Github repo: faetalize/zodiac

## Features

| Feature | Relevant Files | Premium Endpoint | Local SDK | Notes |
|---------|----------------|------------------|-----------|-------|
| **Chat Management** |
| Chat CRUD | [Chats.service.ts](src/services/Chats.service.ts), [Chat.ts](src/types/Chat.ts) | — | ✓ | IndexedDB storage with incremental message loading |
| Chat search & filter | [ChatSearch.component.ts](src/components/static/ChatSearch.component.ts) | — | ✓ | Real-time sidebar search |
| Chat sorting | [ChatSort.component.ts](src/components/static/ChatSort.component.ts), [Chats.service.ts](src/services/Chats.service.ts#L119) | — | ✓ | created_at, last_interaction, alphabetical modes |
| Chat export | [Sidebar.component.ts](src/components/static/Sidebar.component.ts) | — | ✓ | Bulk export all chats to JSON |
| Message pagination | [Chats.service.ts](src/services/Chats.service.ts#L20-L24) | — | ✓ | 50 messages per page, load older on scroll |
| Message edit & regenerate | [message.ts](src/components/dynamic/message.ts), [Message.service.ts](src/services/Message.service.ts) | ✓ | ✓ | Edit user messages, regenerate from any point |
| **Group Chats** |
| RPG group chat mode | [GroupChat.service.ts](src/services/GroupChat.service.ts), [RpgGroupChat.ts](src/services/RpgGroupChat.ts), [Message.service.ts](src/services/Message.service.ts#L654-L687) | ✓ | ✓ | Turn-based multi-persona conversations with turn order |
| Narrator feature | [RpgGroupChat.ts](src/services/RpgGroupChat.ts), [personalityMarkers.ts](src/utils/personalityMarkers.ts) | ✓ | — | AI-generated plot events/interruptions in RPG mode |
| Group dynamic mode | [Chat.ts](src/types/Chat.ts#L5) | — | — | Planned (not implemented) |
| **AI & Responses** |
| Gemini local SDK | [Message.service.ts](src/services/Message.service.ts), [GeminiResponseProcessor.service.ts](src/services/GeminiResponseProcessor.service.ts) | — | ✓ | Native API key support via @google/genai |
| Premium endpoint fallback | [Message.service.ts](src/services/Message.service.ts#L939), [PremiumEndpointResponseProcessor.service.ts](src/services/PremiumEndpointResponseProcessor.service.ts) | ✓ | — | Server-side API key for unrestricted access |
| Response streaming | [Message.service.ts](src/services/Message.service.ts#L1233-L1349), [GeminiResponseProcessor.service.ts](src/services/GeminiResponseProcessor.service.ts), [PremiumEndpointResponseProcessor.service.ts](src/services/PremiumEndpointResponseProcessor.service.ts) | ✓ | ✓ | Real-time token-by-token response rendering |
| Response interruption | [Message.service.ts](src/services/Message.service.ts#L90), [Message.ts](src/types/Message.ts#L26) | ✓ | ✓ | User can abort mid-generation, partial content saved |
| Thinking/reasoning (CoT) | [Message.ts](src/types/Message.ts#L22), [GeminiResponseProcessor.service.ts](src/services/GeminiResponseProcessor.service.ts) | ✓ | ✓ | Chain-of-thought in collapsible section, configurable budget |
| Thinking budget control | [ThinkingBudgetInput.component.ts](src/components/static/ThinkingBudgetInput.component.ts) | ✓ | ✓ | Max thinking tokens (default 500) |
| Output token limit | [maxOutputTokens.component.ts](src/components/static/maxOutputTokens.component.ts) | ✓ | ✓ | Configurable max tokens per response |
| Temperature control | [TemperatureSlider.component.ts](src/components/static/TemperatureSlider.component.ts) | ✓ | ✓ | 0-100 scale for response creativity |
| Model selector | [ModelSelector.component.ts](src/components/static/ModelSelector.component.ts) | ✓ | ✓ | Switch between available LLMs (Gemini Flash, Pro, etc.) |
| **Image Generation** |
| Image generation (diffusion) | [Message.service.ts](src/services/Message.service.ts#L1422-L1470), [ImageButton.component.ts](src/components/static/ImageButton.component.ts) | ✓ | — | Dedicated image models (Imagen-4.0) via premium endpoint |
| Image editing (diffusion) | [ImageEditButton.component.ts](src/components/static/ImageEditButton.component.ts), [Message.service.ts](src/services/Message.service.ts) | ✓ | — | Inpaint/outpaint with Qwen editing models |
| Image gen by Gemini multimodal | [Message.service.ts](src/services/Message.service.ts), [ImageButton.component.ts](src/components/static/ImageButton.component.ts) | ✓ | ✓ | Nano Banana multimodal LLMs (image gen as part of chat) |
| Image credits system | [ImageCreditsLabel.component.ts](src/components/static/ImageCreditsLabel.component.ts) | ✓ | — | Per-user image token tracking, visible only when premium |
| Image credit topup | [TopUpImageCredits.component.ts](src/components/static/TopUpImageCredits.component.ts) | ✓ | — | Purchase additional image generation credits |
| **Personas** |
| Persona CRUD | [Personality.service.ts](src/services/Personality.service.ts), [Personality.ts](src/types/Personality.ts) | — | ✓ | Local UUID-based with marketplace sync support |
| Persona marketplace sync | [Personality.service.ts](src/services/Personality.service.ts#L1-L60), [Supabase.service.ts](src/services/Supabase.service.ts) | — | ✓ | Import from marketplace, check for updates, version tracking |
| Persona tone customization | [TONE_QUESTIONS.ts](src/constants/ToneQuestions.ts), [Personality.service.ts](src/services/Personality.service.ts) | — | ✓ | Questionnaire-driven personality tuning with tone examples |
| Persona categories & tags | [Personality.ts](src/types/Personality.ts#L5-L24) | — | ✓ | Marketplace organization; syncedFrom tracks origin |
| Persona export | [Sidebar.component.ts](src/components/static/Sidebar.component.ts) | — | ✓ | Bulk export all personas to JSON |
| Default persona | [Personality.service.ts](src/services/Personality.service.ts#L103) | — | ✓ | Built-in fallback for first-time users |
| **Attachments** |
| File attachments | [AttachButton.component.ts](src/components/static/AttachButton.component.ts), [Message.ts](src/types/Message.ts#L14) | ✓ | ✓ | Up to 6 files, 10MB total (PDFs, text, images) |
| Image history preview | [HistoryImagePreview.ts](src/components/dynamic/HistoryImagePreview.ts) | ✓ | ✓ | Recent image selection from previous generations |
| **Customization** |
| Theme selection | [Theme.service.ts](src/services/Theme.service.ts), [ThemeControls.component.ts](src/components/static/ThemeControls.component.ts) | — | ✓ | 7 color themes (blue, red, green, purple, pink, orange, monochrome) |
| Light/dark mode | [Theme.service.ts](src/services/Theme.service.ts#L70-L92) | — | ✓ | Manual override or OS preference sync |
| Profile picture | [ProfilePanel.component.ts](src/components/static/ProfilePanel.component.ts), [Supabase.service.ts](src/services/Supabase.service.ts) | — | ✓ | Synced with Supabase auth |
| Preferred name | [ProfilePanel.component.ts](src/components/static/ProfilePanel.component.ts) | — | ✓ | Display name customization |
| System prompt addition | [Supabase.service.ts](src/services/Supabase.service.ts) | — | ✓ | User-specific system prompt injection |
| Auto-scroll toggle | [Settings.service.ts](src/services/Settings.service.ts) | — | ✓ | localStorage-persisted preference |
| **User Management** |
| Login & registration | [Login.component.ts](src/components/static/Login.component.ts), [Register.component.ts](src/components/static/Register.component.ts) | — | ✓ | Supabase auth integration |
| Password recovery | [PasswordReset.component.ts](src/components/static/PasswordReset.component.ts), [Supabase.service.ts](src/services/Supabase.service.ts#L18-L267) | — | ✓ | Email-based password reset flow |
| Email update | [EmailUpdate.component.ts](src/components/static/EmailUpdate.component.ts) | — | ✓ | Change primary email address |
| Session management | [Supabase.service.ts](src/services/Supabase.service.ts#L37-L70) | — | ✓ | Real-time auth state tracking with CustomEvents |
| **Monetization** |
| Subscription tiers | [Supabase.service.ts](src/services/Supabase.service.ts), [CollapsibleSubscriptionCards.component.ts](src/components/static/CollapsibleSubscriptionCards.component.ts) | ✓ | — | Free, Pro (unlimited image gen), Max (advanced features) |
| Subscribe to Pro | [SubscribeProButton.component.ts](src/components/static/SubscribeProButton.component.ts) | ✓ | — | Stripe integration via Supabase |
| Subscribe to Max | [SubscribeMaxButton.component.ts](src/components/static/SubscribeMaxButton.component.ts) | ✓ | — | Higher tier with additional benefits |
| Manage subscription | [Supabase.service.ts](src/services/Supabase.service.ts#L365-L372) | ✓ | — | Stripe customer portal access |
| **Data & Import** |
| LoRA support | [Lora.service.ts](src/services/Lora.service.ts), [LoraManager.component.ts](src/components/static/LoraManager.component.ts) | ✓ | — | Load custom LoRA models with adjustable strength |
| **UI & Navigation** |
| Settings page | [SettingsCollapsible.component.ts](src/components/static/SettingsCollapsible.component.ts), [SettingsNavigation.component.ts](src/components/static/SettingsNavigation.component.ts) | — | ✓ | Android-style categorized settings with tab navigation |
| Tabbed navigation | [TabView.component.ts](src/components/static/TabView.component.ts) | — | ✓ | Reusable tab UI in sidebar (login/register) and settings |
| Toast notifications | [Toast.service.ts](src/services/Toast.service.ts), [Toast.ts](src/components/dynamic/Toast.ts) | — | ✓ | Info, warning, danger severities with actions; max 5 concurrent |
| Confirmation dialog | [Overlay.service.ts](src/services/Overlay.service.ts) | — | ✓ | Modal for destructive actions (delete chat/persona) |
| Sidebar management | [Sidebar.component.ts](src/components/static/Sidebar.component.ts) | — | ✓ | Chat list with icons (group vs single), drag-drop ready |
| **Onboarding & Help** |
| First-run onboarding | [Onboarding.service.ts](src/services/Onboarding.service.ts), [Onboarding.component.ts](src/components/static/Onboarding.component.ts) | — | ✓ | Guided setup with theme/API key/subscription selection |
| API key validation | [ApiKeyInput.component.ts](src/components/static/ApiKeyInput.component.ts) | ✓ | ✓ | Real-time validation with environment-specific endpoints |
| Changelog/What's New | [WhatsNew.component.ts](src/components/static/WhatsNew.component.ts) | — | ✓ | Display release notes on new version |

## Architecture Overview

### Core Structure
- **Entry point**: [src/main.ts](src/main.ts) bootstraps services and eager-loads all static components
- **Data layer**: Dexie (IndexedDB) in [src/services/Db.service.ts](src/services/Db.service.ts) - local-first with Supabase sync
- **Two component types**:
  - `components/static/*.component.ts` - DOM-bound singletons, auto-loaded at startup via `import.meta.glob`
  - `components/dynamic/*.ts` - Template factories returning HTMLElements (e.g., `messageElement()`)

### Key Services
| Service | Purpose |
|---------|---------|
| `Message.service.ts` | API communication (Gemini SDK, OpenRouter, premium endpoints), streaming responses |
| `Chats.service.ts` | Chat CRUD, pagination, sidebar management |
| `Supabase.service.ts` | Auth, subscriptions, cloud sync, image credits |
| `Personality.service.ts` | AI personas with marketplace sync |
| `Theme.service.ts` | Color themes + light/dark mode (singleton class pattern) |

### Data Models
- `Chat` / `DbChat` (in [src/types/Chat.ts](src/types/Chat.ts)) - Conversations with messages and optional group chat config
- `Message` (in [src/types/Message.ts](src/types/Message.ts)) - User/model messages with attachments, generated images, thinking traces
- `Personality` / `DbPersonality` (in [src/types/Personality.ts](src/types/Personality.ts)) - Customizable AI personas with tone settings

## Development

```bash
npm install
npm run dev          # Local dev server with SSL
npm run build        # Type-check + production build
npm run sync-db-types  # Sync Supabase types to src/types/database.types.ts
```

### Agent worktree workflow
- Use `npm run create-worktree -- <branch> [worktree-path] [options]` to create a sibling worktree without interactive prompts.
- For issue-driven work, prefer `npm run create-worktree -- --issue <number> --publish --open`.
- The script can create or reuse a local branch, run `npm install`, push with `-u` to the remote, and open a new Alacritty window running `opencode` in the new worktree.
- Run `npm run create-worktree -- --help` for the full flag list and positional argument rules.

## Release Cycle

### Branching and deployment flow
- Production deploys are published from a dedicated release branch because Cloudflare Pages is configured to deploy a specific branch for releases.
- `main` is the ongoing development branch.
- A release branch is created from `main` after the intended features/fixes have already been merged there.
- Release-only preparation happens on that release branch first.
- After the release is deployed, the release branch must be backmerged into `main` so `main` also contains the final version string and in-app changelog for that release.

### Preparing a new release
- Identify the last release backmerge commit on `main`, then inspect all mainline commits after that point up to `HEAD`.
- Use those commits to determine what actually shipped in the new release.
- Update the user-facing changelog in [src/index.html](src/index.html) under the `#whats-new` section.
- Update the version string in [src/utils/helpers.ts](src/utils/helpers.ts) so the badge and changelog header display the new version.
- Keep the release branch and deployed artifact aligned before any tag is created.

### How to build the changelog well
- The in-app changelog is user-facing marketing/product copy, not a technical document.
- Summarize released value, not implementation details. Prefer feature outcomes and user benefits over commit-level mechanics.
- Do not mention developer-only infrastructure or internal workflow changes unless they directly affect Zodiac users.
- Favor broad, human phrasing such as `RPG group chat stability improvements` over overly granular engineering detail.
- When a shipped feature is genuinely user-visible, name it clearly (for example, `Message debug tools`) instead of hiding it behind vague wording.
- Good entries should feel like release notes written for users: concise, readable, and slightly polished rather than deeply technical.

### Tagging guidance
- If tags are meant to represent what is on `main`, create the tag after the release branch has been backmerged into `main`.
- If tags are meant to represent the exact commit deployed by Cloudflare Pages, tag the release branch commit that was actually deployed.
- Do not tag `main` before the backmerge if `main` does not yet contain the final release changelog/version bump.

## Conventions

### Component Pattern
Static components query DOM elements at module load and throw if missing:
```typescript
// src/components/static/Example.component.ts
const element = document.querySelector<HTMLButtonElement>("#my-button");
if (!element) throw new Error("Missing DOM element: #my-button");

element.addEventListener("click", () => { /* handler */ });
export { element };
```

### Cross-Component Communication
Use `CustomEvent` on `window` or `document` for decoupled messaging:
```typescript
// Emit
window.dispatchEvent(new CustomEvent('generation-state-changed', { detail: { isGenerating: true } }));

// Listen  
window.addEventListener('generation-state-changed', (e) => { /* handle */ });
```

Key events: `auth-state-changed`, `generation-state-changed`, `chat-model-changed`, `subscription-updated`, `round-state-changed`

### Service Initialization
Services export an `initialize()` function called from `main.ts` in dependency order. Avoid circular imports by using event-based communication.

### Database Migrations
Dexie schema versions in `Db.service.ts` are additive. Use `.upgrade()` for data migrations:
```typescript
db.version(N).stores({ /* schema */ }).upgrade(async (tx) => { /* migrate */ });
```

### Settings Persistence
User preferences use `localStorage` with service-level get/set wrappers. See [src/services/Settings.service.ts](src/services/Settings.service.ts).

### Test Scope And Failure Mapping
- Treat tests as three explicit layers:
- Type 1: pure logic/unit tests. These can mock freely and should not make UI behavior claims.
- Type 2: service/state integration tests. These may mock renderers or external boundaries, and should be presented as service/state coverage rather than proof of live DOM behavior.
- Type 3: feature/user-story tests. These should use the real component, real DOM wiring, and real user-triggered entrypoint wherever practical.
- Do not force Vitest/JSDOM to stand in for full browser fidelity when the main risk is real browser behavior. If a feature story depends on focus, selection, drag/drop, scrolling, async DOM timing, or broad app-shell wiring, prefer Playwright over a heavily simulated JSDOM setup.
- Default to using the real existing component/element unless there is a concrete reason to mock it, such as unsupported browser behavior, meaningfully harder setup, substantial test slowdown, or unrelated failure modes.
- If the user asks to test a feature, user story, live behavior, or a reported UI bug, default to a Type 3 test unless they explicitly ask for a lower-layer test.
- Most Zodiac feature-level tests should be Type 3. Use Type 1 and Type 2 tests to support targeted logic and service coverage, not as substitutes for feature behavior coverage.
- Use Playwright for the highest-value user stories and browser-fidelity risks. In Zodiac this especially includes chat creation/selection flows, deleting selected vs unselected chats, attachment drag/drop, abort-generation behavior, and cloud-sync-critical stories.
- Use Vitest for logic, state integrity, message index correctness, persistence behavior, and targeted integrations where browser fidelity is not the main uncertainty.
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

### Supabase Types
After schema changes, run `npm run sync-db-types` to regenerate [src/types/database.types.ts](src/types/database.types.ts).

### Supabase Dashboard Edge Function Quirk
- The current deployment flow uses the Supabase Dashboard for individual edge functions in `zozo-edge/functions/`.
- Do not rely on shared sibling folders like `functions/_shared/` or cross-function relative imports for deployable code.
- Keep any required helpers/constants inside each deployed function file unless the user explicitly confirms a bundling/deploy process that supports shared files.
