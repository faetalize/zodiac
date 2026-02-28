# Zodiac AI Agent Instructions

A Vite + TypeScript frontend for Google Gemini and OpenRouter APIs with local-first IndexedDB storage and optional Supabase cloud sync.

Github repo: faetalize/zodiac

Last manually verified: 2026 28th of February

## Features

| Feature | Relevant Files | Premium Endpoint | Local SDK | Notes |
|---------|----------------|------------------|-----------|-------|
| **Chat Management** |
| Chat CRUD | [Chats.service.ts](src/services/Chats.service.ts), [Chat.ts](src/types/Chat.ts) | — | ✓ | IndexedDB storage with incremental message loading |
| Chat search & filter | [ChatSearch.component.ts](src/components/static/ChatSearch.component.ts) | — | ✓ | Real-time sidebar search |
| Chat sorting | [ChatSort.component.ts](src/components/static/ChatSort.component.ts), [Chats.service.ts](src/services/Chats.service.ts) | — | ✓ | created_at, last_interaction, alphabetical modes |
| Chat export | [Sidebar.component.ts](src/components/static/Sidebar.component.ts) | — | ✓ | Bulk export all chats to JSON |
| Message pagination | [Chats.service.ts](src/services/Chats.service.ts) | — | ✓ | 50 messages per page, load older on scroll |
| Message edit & regenerate | [message.ts](src/components/dynamic/message.ts), [Message.service.ts](src/services/Message.service.ts) | ✓ | ✓ | Edit user messages, regenerate from any point |
| **Group Chats** |
| RPG group chat mode | [GroupChat.service.ts](src/services/GroupChat.service.ts), [RpgGroupChat.ts](src/services/RpgGroupChat.ts), [Message.service.ts](src/services/Message.service.ts) | ✓ | ✓ | Turn-based multi-persona conversations with turn order |
| Narrator feature | [RpgGroupChat.ts](src/services/RpgGroupChat.ts), [personalityMarkers.ts](src/utils/personalityMarkers.ts) | ✓ | — | AI-generated plot events/interruptions in RPG mode |
| Dynamic group chat mode | [GroupChat.service.ts](src/services/GroupChat.service.ts), [DynamicGroupChat.ts](src/services/DynamicGroupChat.ts), [CreateGroupChat.component.ts](src/components/static/CreateGroupChat.component.ts) | ✓ | ✓ | Implemented probabilistic multi-persona chat with per-persona guardrails |
| Group chat typing indicator | [GroupChatTyping.service.ts](src/services/GroupChatTyping.service.ts), [GroupChatTypingIndicator.component.ts](src/components/static/GroupChatTypingIndicator.component.ts) | ✓ | ✓ | Shows active typing personas in dynamic mode |
| Dynamic @mentions / ping routing | [ChatInput.component.ts](src/components/static/ChatInput.component.ts), [mentions.ts](src/utils/mentions.ts), [DynamicGroupChat.ts](src/services/DynamicGroupChat.ts) | ✓ | ✓ | Optional forced-speaker mentions with ping toggles and ping-only mode |
| **AI & Responses** |
| Gemini local SDK | [Message.service.ts](src/services/Message.service.ts), [GeminiResponseProcessor.service.ts](src/services/GeminiResponseProcessor.service.ts) | — | ✓ | Native API key support via @google/genai |
| Premium endpoint fallback | [Message.service.ts](src/services/Message.service.ts), [PremiumEndpointResponseProcessor.service.ts](src/services/PremiumEndpointResponseProcessor.service.ts) | ✓ | — | Server-side API key for unrestricted access |
| Response streaming | [Message.service.ts](src/services/Message.service.ts), [GeminiResponseProcessor.service.ts](src/services/GeminiResponseProcessor.service.ts), [PremiumEndpointResponseProcessor.service.ts](src/services/PremiumEndpointResponseProcessor.service.ts) | ✓ | ✓ | Real-time token-by-token response rendering |
| Response interruption | [Message.service.ts](src/services/Message.service.ts), [Message.ts](src/types/Message.ts) | ✓ | ✓ | User can abort mid-generation, partial content saved |
| Thinking/reasoning (CoT) | [Message.ts](src/types/Message.ts), [GeminiResponseProcessor.service.ts](src/services/GeminiResponseProcessor.service.ts) | ✓ | ✓ | Chain-of-thought in collapsible section, configurable budget |
| Thinking toggle behavior | [ThinkingSelector.component.ts](src/components/static/ThinkingSelector.component.ts), [ModelSelector.component.ts](src/components/static/ModelSelector.component.ts) | ✓ | ✓ | Enables/disables reasoning and enforces model-specific constraints |
| Thinking budget control | [ThinkingBudgetInput.component.ts](src/components/static/ThinkingBudgetInput.component.ts) | ✓ | ✓ | Max thinking tokens (default 500) |
| Output token limit | [maxOutputTokens.component.ts](src/components/static/maxOutputTokens.component.ts) | ✓ | ✓ | Configurable max tokens per response |
| Temperature control | [TemperatureSlider.component.ts](src/components/static/TemperatureSlider.component.ts) | ✓ | ✓ | 0-100 scale for response creativity |
| Model selector | [ModelSelector.component.ts](src/components/static/ModelSelector.component.ts) | ✓ | ✓ | Switch between available LLMs (Gemini Flash, Pro, etc.) |
| **Image Generation** |
| Image generation (diffusion) | [Message.service.ts](src/services/Message.service.ts), [ImageButton.component.ts](src/components/static/ImageButton.component.ts) | ✓ | — | Dedicated image models via premium endpoint |
| Image editing (diffusion) | [ImageEditButton.component.ts](src/components/static/ImageEditButton.component.ts), [Message.service.ts](src/services/Message.service.ts) | ✓ | — | Inpaint/outpaint with Qwen editing models |
| Image gen by Gemini multimodal | [Message.service.ts](src/services/Message.service.ts), [ImageButton.component.ts](src/components/static/ImageButton.component.ts) | ✓ | ✓ | Nano Banana multimodal LLMs (image gen as part of chat) |
| Image model selectors | [ImageModelSelector.component.ts](src/components/static/ImageModelSelector.component.ts), [ImageEditModelSelector.component.ts](src/components/static/ImageEditModelSelector.component.ts), [Settings.service.ts](src/services/Settings.service.ts) | ✓ | ✓ | Separate generation/edit model selection persisted in settings |
| Image credits system | [ImageCreditsLabel.component.ts](src/components/static/ImageCreditsLabel.component.ts) | ✓ | — | Per-user image token tracking, visible only when premium |
| Image credit topup | [TopUpImageCredits.component.ts](src/components/static/TopUpImageCredits.component.ts) | ✓ | — | Purchase additional image generation credits |
| **Personas** |
| Persona CRUD | [Personality.service.ts](src/services/Personality.service.ts), [Personality.ts](src/types/Personality.ts) | — | ✓ | Local UUID-based with marketplace sync support |
| Persona marketplace sync | [Personality.service.ts](src/services/Personality.service.ts), [Supabase.service.ts](src/services/Supabase.service.ts) | — | ✓ | Import from marketplace, check for updates, version tracking |
| Persona tone customization | [TONE_QUESTIONS.ts](src/constants/ToneQuestions.ts), [Personality.service.ts](src/services/Personality.service.ts) | — | ✓ | Questionnaire-driven personality tuning with tone examples |
| Persona categories & tags | [Personality.ts](src/types/Personality.ts), [AddPersonalityForm.component.ts](src/components/static/AddPersonalityForm.component.ts) | — | ✓ | Marketplace organization; syncedFrom tracks origin |
| Persona export | [Sidebar.component.ts](src/components/static/Sidebar.component.ts) | — | ✓ | Bulk export all personas to JSON |
| Default persona | [Personality.service.ts](src/services/Personality.service.ts) | — | ✓ | Built-in fallback for first-time users |
| **Attachments** |
| File attachments | [AttachButton.component.ts](src/components/static/AttachButton.component.ts), [Message.ts](src/types/Message.ts) | ✓ | ✓ | Up to 6 files, 10MB total (PDFs, text, images) |
| Attachment preview & limits | [AttachmentPreview.component.ts](src/components/static/AttachmentPreview.component.ts), [attachments.ts](src/utils/attachments.ts), [ChatInput.component.ts](src/components/static/ChatInput.component.ts) | ✓ | ✓ | Live previews, remove controls, and type/size/count validation |
| Image history preview | [HistoryImagePreview.ts](src/components/dynamic/HistoryImagePreview.ts) | ✓ | ✓ | Recent image selection from previous generations |
| **Customization** |
| Theme selection | [Theme.service.ts](src/services/Theme.service.ts), [ThemeControls.component.ts](src/components/static/ThemeControls.component.ts) | — | ✓ | Color themes with runtime switching |
| Light/dark mode | [Theme.service.ts](src/services/Theme.service.ts) | — | ✓ | Manual override or OS preference sync |
| Profile picture | [ProfilePanel.component.ts](src/components/static/ProfilePanel.component.ts), [Supabase.service.ts](src/services/Supabase.service.ts) | — | ✓ | Synced with Supabase auth |
| Preferred name | [ProfilePanel.component.ts](src/components/static/ProfilePanel.component.ts) | — | ✓ | Display name customization |
| System prompt addition | [Supabase.service.ts](src/services/Supabase.service.ts) | — | ✓ | User-specific system prompt injection |
| Auto-scroll toggle | [Settings.service.ts](src/services/Settings.service.ts) | — | ✓ | localStorage-persisted preference |
| Streaming toggle | [Settings.service.ts](src/services/Settings.service.ts) | ✓ | ✓ | Enable/disable token streaming behavior |
| **User Management** |
| Login & registration | [Login.component.ts](src/components/static/Login.component.ts), [Register.component.ts](src/components/static/Register.component.ts) | — | ✓ | Supabase auth integration |
| Password recovery | [PasswordReset.component.ts](src/components/static/PasswordReset.component.ts), [Supabase.service.ts](src/services/Supabase.service.ts) | — | ✓ | Email-based password reset flow |
| Email update | [EmailUpdate.component.ts](src/components/static/EmailUpdate.component.ts) | — | ✓ | Change primary email address |
| Session management | [Supabase.service.ts](src/services/Supabase.service.ts), [events/index.ts](src/events/index.ts) | — | ✓ | Real-time auth/subscription state tracking with CustomEvents |
| **Monetization** |
| Subscription tiers | [Supabase.service.ts](src/services/Supabase.service.ts), [CollapsibleSubscriptionCards.component.ts](src/components/static/CollapsibleSubscriptionCards.component.ts) | ✓ | — | Free, Pro (unlimited image gen), Max (advanced features) |
| Subscribe to Pro | [SubscribeProButton.component.ts](src/components/static/SubscribeProButton.component.ts) | ✓ | — | Stripe integration via Supabase |
| Subscribe to Max | [SubscribeMaxButton.component.ts](src/components/static/SubscribeMaxButton.component.ts) | — | — | UI present but currently marked "Coming Soon" |
| Manage subscription | [Supabase.service.ts](src/services/Supabase.service.ts), [ProfilePanel.component.ts](src/components/static/ProfilePanel.component.ts) | ✓ | — | Stripe customer portal access |
| **Data & Import** |
| LoRA support | [Lora.service.ts](src/services/Lora.service.ts), [LoraManager.component.ts](src/components/static/LoraManager.component.ts) | ✓ | — | Load custom LoRA models with adjustable strength |
| **UI & Navigation** |
| Settings page navigation | [SettingsNavigation.component.ts](src/components/static/SettingsNavigation.component.ts) | — | ✓ | Categorized settings pages with in-panel navigation |
| Tabbed navigation | [TabView.component.ts](src/components/static/TabView.component.ts) | — | ✓ | Reusable tab UI in sidebar (login/register) and settings |
| Toast notifications | [Toast.service.ts](src/services/Toast.service.ts), [Toast.ts](src/components/dynamic/Toast.ts) | — | ✓ | Info, warning, danger severities with actions; max 5 concurrent |
| Confirmation dialog | [Overlay.service.ts](src/services/Overlay.service.ts) | — | ✓ | Modal for destructive actions (delete chat/persona) |
| Sidebar management | [Sidebar.component.ts](src/components/static/Sidebar.component.ts) | — | ✓ | Chat list with icons (group vs single), drag-drop ready |
| **Onboarding & Help** |
| First-run onboarding | [Onboarding.service.ts](src/services/Onboarding.service.ts), [Onboarding.component.ts](src/components/static/Onboarding.component.ts) | — | ✓ | Guided setup with theme/API key/subscription selection |
| API key validation | [ApiKeyInput.component.ts](src/components/static/ApiKeyInput.component.ts) | ✓ | ✓ | Real-time validation and premium-endpoint preference toggle |
| Changelog/What's New | [WhatsNew.component.ts](src/components/static/WhatsNew.component.ts) | — | ✓ | Display release notes on new version |

## Known Gaps / WIP

- [OnlineSyncButton.component.ts](src/components/static/OnlineSyncButton.component.ts) currently contains only imports and no UI logic yet.
- [SettingsCollapsible.component.ts](src/components/static/SettingsCollapsible.component.ts) exists but is currently empty; settings navigation behavior is implemented in [SettingsNavigation.component.ts](src/components/static/SettingsNavigation.component.ts).
- “Subscribe to Max” UI exists, but flow is intentionally disabled as “Coming Soon” in [SubscribeMaxButton.component.ts](src/components/static/SubscribeMaxButton.component.ts).

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
| `DynamicGroupChat.ts` | Dynamic group chat orchestration with probabilistic multi-speaker turns |
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

### Styling
We have modes (light and dark) and themes (the color themes, blue being default, red, purple, etc.).
Each mode supports all the themes. We can have light blue, dark red, dark purple, light red, etc.
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
What's a static component? It's any element on the page that has static HTML markup and needs to come alive with javascript. We need to ensure each "component" has independent TS code for ease of maintenance. 
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
