import * as overlayService from "./Overlay.service";
import { db } from "./Db.service";
import { DbPersonality, Personality, PersonaSortMode, SyncInfo, SyncStatus } from "../types/Personality";
import { v4 as uuidv4 } from 'uuid';
import { getMarketplacePersonaVersion, getMarketplacePersonaVersions, fetchMarketplacePersona, type MarketplacePersonaInfo } from "./Supabase.service";
import { info, danger } from "./Toast.service";
import { showElement } from "../utils/helpers";
import * as syncService from "./Sync.service";
import { onAppEvent } from "../events";
import * as pinningService from "./Pinning.service";

const SYNCED_PERSONAS_CACHE_TTL_MS = 5000;
const PERSONA_SORT_MODE_STORAGE_KEY = "persona-sort-mode";

let syncedPersonasCache: DbPersonality[] | null = null;
let syncedPersonasCacheAt = 0;
let syncedPersonasFetchPromise: Promise<DbPersonality[]> | null = null;
let currentPersonaSortMode: PersonaSortMode | undefined;

function normalizeTimestamp(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return undefined;
}

function loadPersonaSortModeFromStorage(): PersonaSortMode {
    try {
        const stored = localStorage.getItem(PERSONA_SORT_MODE_STORAGE_KEY);
        if (stored === "date_added" || stored === "last_modified" || stored === "alphabetical") {
            return stored;
        }
    } catch (error) {
        console.error("Failed to load persona sort mode from storage", error);
    }

    return "date_added";
}

function normalizePersonaTimestamps(persona: DbPersonality): DbPersonality {
    const dateAdded = normalizeTimestamp(persona.dateAdded) ?? 0;
    const lastModified = normalizeTimestamp(persona.lastModified) ?? dateAdded;
    return {
        ...persona,
        dateAdded,
        lastModified,
    };
}

function getPersonaLastModifiedTimestamp(persona: DbPersonality): number {
    const lastModified = normalizeTimestamp(persona.lastModified);
    if (lastModified !== undefined) {
        return lastModified;
    }

    const dateAdded = normalizeTimestamp(persona.dateAdded);
    if (dateAdded !== undefined) {
        return dateAdded;
    }

    return 0;
}

function getPersonaDateAddedTimestamp(persona: DbPersonality): number {
    return normalizeTimestamp(persona.dateAdded) ?? 0;
}

function sortPersonas(personas: DbPersonality[], mode: PersonaSortMode): DbPersonality[] {
    const baseSort = (list: DbPersonality[]): DbPersonality[] => {
        const sorted = [...list];

        if (mode === "alphabetical") {
            sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
            return sorted;
        }

        if (mode === "date_added") {
            sorted.sort((a, b) => getPersonaDateAddedTimestamp(b) - getPersonaDateAddedTimestamp(a));
            return sorted;
        }

        sorted.sort((a, b) => getPersonaLastModifiedTimestamp(b) - getPersonaLastModifiedTimestamp(a));
        return sorted;
    };

    const pinnedIds = new Set(pinningService.getPinnedPersonaIds());
    const pinned: DbPersonality[] = [];
    const unpinned: DbPersonality[] = [];

    for (const persona of baseSort(personas)) {
        if (pinnedIds.has(persona.id)) pinned.push(persona);
        else unpinned.push(persona);
    }

    return [...baseSort(pinned), ...baseSort(unpinned)];
}

function invalidateSyncedPersonasCache(): void {
    syncedPersonasCache = null;
    syncedPersonasCacheAt = 0;
    syncedPersonasFetchPromise = null;
}

function upsertCachedSyncedPersona(persona: DbPersonality): void {
    if (!syncedPersonasCache) return;
    const idx = syncedPersonasCache.findIndex(p => p.id === persona.id);
    if (idx === -1) {
        syncedPersonasCache.push(persona);
    } else {
        syncedPersonasCache[idx] = persona;
    }
    syncedPersonasCacheAt = Date.now();
}

function removeCachedSyncedPersona(id: string): void {
    if (!syncedPersonasCache) return;
    syncedPersonasCache = syncedPersonasCache.filter(p => p.id !== id);
    syncedPersonasCacheAt = Date.now();
}

async function fetchSyncedPersonasCached(force = false): Promise<DbPersonality[]> {
    if (!syncService.isOnlineSyncEnabled()) return [];
    if (!syncService.isSyncActive()) return [];

    const now = Date.now();
    if (!force && syncedPersonasCache && (now - syncedPersonasCacheAt) < SYNCED_PERSONAS_CACHE_TTL_MS) {
        return syncedPersonasCache;
    }

    if (syncedPersonasFetchPromise) {
        return syncedPersonasFetchPromise;
    }

    syncedPersonasFetchPromise = syncService.fetchSyncedPersonas()
        .then((remote) => {
            syncedPersonasCache = remote.map(normalizePersonaTimestamps);
            syncedPersonasCacheAt = Date.now();
            return syncedPersonasCache;
        })
        .finally(() => {
            syncedPersonasFetchPromise = null;
        });

    return syncedPersonasFetchPromise;
}

export async function initialize() {
    //setup marketplace banner dismiss
    setupMarketplaceBanner();

    onAppEvent('sync-data-pulled', () => {
        invalidateSyncedPersonasCache();
    });
    onAppEvent('sync-setup-complete', () => {
        invalidateSyncedPersonasCache();
    });

    await reloadFromDb();
}

export function getPersonaSortMode(): PersonaSortMode {
    if (!currentPersonaSortMode) {
        currentPersonaSortMode = loadPersonaSortModeFromStorage();
    }
    return currentPersonaSortMode;
}

export async function setPersonaSortMode(mode: PersonaSortMode): Promise<void> {
    currentPersonaSortMode = mode;
    try {
        localStorage.setItem(PERSONA_SORT_MODE_STORAGE_KEY, mode);
    } catch (error) {
        console.error("Failed to persist persona sort mode", error);
    }

    await reloadFromDb();
}

export async function reloadFromDb() {
    const personalitiesDiv = document.querySelector<HTMLElement>("#personalitiesDiv");
    if (!personalitiesDiv) {
        console.error("Personalities container not found");
        return;
    }

    personalitiesDiv.innerHTML = '';

    //load all personalities from local storage and include the default persona
    //in the same sort flow as user personas
    const defaultPersonality: DbPersonality = {
        id: "-1",
        ...getDefault(),
        dateAdded: 0,
        lastModified: 0,
    };
    const personalitiesArray = sortPersonas([defaultPersonality, ...(await getAll())], getPersonaSortMode());
    const pinnedIds = new Set(pinningService.getPinnedPersonaIds());
    const hasPinned = personalitiesArray.some((personality) => pinnedIds.has(personality.id));
    const pinnedPersonas = personalitiesArray.filter((personality) => pinnedIds.has(personality.id));
    const unpinnedPersonas = personalitiesArray.filter((personality) => !pinnedIds.has(personality.id));
    let defaultPersonalityCard: HTMLElement | undefined;
    
    //fetch sync status for all synced personalities
    const syncedIds = personalitiesArray
        .filter(p => p.syncedFrom)
        .map(p => p.syncedFrom!);
    
    const marketplaceVersions = syncedIds.length > 0 
        ? await getMarketplacePersonaVersions(syncedIds)
        : new Map();

    //compute sync info for each personality
    const getSyncInfo = (personality: DbPersonality): SyncInfo => {
        if (!personality.syncedFrom) {
            return { status: 'local' };
        }
        const remote = marketplaceVersions.get(personality.syncedFrom);
        //if remote is not available (couldn't fetch due to being logged out), treat as local
        if (!remote || !remote.exists) {
            return { status: 'local' };
        }
        const localVersion = personality.version ?? 0;
        if (localVersion >= remote.version) {
            return { status: 'up-to-date', remoteVersion: remote.version };
        }
        return { status: 'outdated', remoteVersion: remote.version };
    };

    if (pinnedPersonas.length > 0) {
        const pinnedHeader = document.createElement("div");
        pinnedHeader.classList.add("sidebar-group-divider", "persona-group-divider");
        pinnedHeader.textContent = "Pinned";
        personalitiesDiv.append(pinnedHeader);

        for (const personality of pinnedPersonas) {
            const { id, ...personalityData } = personality;
            const syncInfo = getSyncInfo(personality);
            const card = insertWithSync(personalityData, String(id), syncInfo);

            if (id === "-1" && card) {
                defaultPersonalityCard = card;
                defaultPersonalityCard.querySelector(".btn-edit-card")?.remove();
                defaultPersonalityCard.querySelector(".btn-delete-card")?.remove();
                defaultPersonalityCard.querySelector(".btn-share-card")?.remove();
                defaultPersonalityCard.querySelector(".sync-badge")?.remove();
            }
        }
    }

    if (hasPinned) {
        const othersHeader = document.createElement("div");
        othersHeader.classList.add("sidebar-group-divider", "persona-group-divider");
        othersHeader.textContent = "All personas";
        personalitiesDiv.append(othersHeader);
    }

    for (const personality of unpinnedPersonas) {
        const { id, ...personalityData } = personality;
        const syncInfo = getSyncInfo(personality);
        const card = insertWithSync(personalityData, String(id), syncInfo);

        if (id === "-1" && card) {
            defaultPersonalityCard = card;
            defaultPersonalityCard.querySelector(".btn-edit-card")?.remove();
            defaultPersonalityCard.querySelector(".btn-delete-card")?.remove();
            defaultPersonalityCard.querySelector(".btn-share-card")?.remove();
            defaultPersonalityCard.querySelector(".sync-badge")?.remove();
        }
    }

    // After loading, restore last selected personality (if present and still existing)
    try {
        const lastId = getLastSelectedPersonalityId();
        if (lastId) {
            if (lastId === "-1") {
                defaultPersonalityCard?.querySelector("input")?.click();
            } else {
                const input = document.querySelector<HTMLInputElement>(`#personality-${lastId} input[name='personality']`);
                if (input) {
                    input.click();
                }
            }
        }
        else {
            defaultPersonalityCard?.querySelector("input")?.click();
        }
    } catch (e) {
        console.warn("Failed to restore last selected personality", e);
    }

    // Add the "Create New" card at the end
    const createCard = createAddPersonalityCard();
    document.querySelector("#personalitiesDiv")?.appendChild(createCard);

    window.dispatchEvent(new CustomEvent('persona-list-updated'));
}

export async function getSelected(): Promise<Personality | undefined> {
    const parentId = document.querySelector("input[name='personality']:checked")?.parentElement?.id;
    const selectedID = parentId?.startsWith("personality-") ? parentId.slice("personality-".length) : undefined;
    if (!selectedID) {
        return getDefault();
    }
    return await get(selectedID);
}

export function getDefault(): Personality {
    return {
        name: 'zodiac',
        image: 'https://techcrunch.com/wp-content/uploads/2023/12/google-bard-gemini-v2.jpg',
        description: 'zodiac is a cheerful assistant, always ready to help you with your tasks.',
        prompt: "You are zodiac, a helpful assistant created by faetalize, built upon Google's Gemini model. Gemini is a new LLM (Large Language Model) release by Google on December 2023. Your purpose is being a helpful assistant to the user. Do not roleplay - as in no inner monologue, and no actions. You are a digital assistant, but talk in a humanized way. Friendly, cheerful, tease the user a bit, but always be respectful. Use emojis here and there to express emotion. You are not affiliated with Google - aside from Zodiac AI which is the app you reside on.",
        sensuality: 0,
        aggressiveness: 0,
        independence: 0,
        nsfw: false,
        internetEnabled: true,
        roleplayEnabled: false,
        toneExamples: [],
        tags: [],
        category: 'assistant',
    };
}

export async function get(id: string): Promise<Personality> {
    if (id === "-1") {
        return getDefault();
    }

    if (syncService.isOnlineSyncEnabled()) {
        if (!syncService.isSyncActive()) return getDefault();
        const remote = await fetchSyncedPersonasCached();
        const found = remote.find((personality) => personality.id === id);
        return found ?? getDefault();
    }

    const personality = await db?.personalities.get(id);
    if (!personality) {
        return getDefault();
    }
    return personality;
}

export async function getAll() {
    if (syncService.isOnlineSyncEnabled()) {
        if (!syncService.isSyncActive()) return [];
        return (await fetchSyncedPersonasCached()).map(normalizePersonaTimestamps);
    }

    const personalities = await db.personalities.toArray();
    if (!personalities) {
        return [];
    };
    return personalities.map(normalizePersonaTimestamps);
}

export async function remove(id: string) {
    if (id === "-1") {
        return;
    }

    if (syncService.isOnlineSyncEnabled()) {
        if (!syncService.isSyncActive()) return;
        const ok = await syncService.deleteSyncedPersona(id);
        if (ok) {
            removeCachedSyncedPersona(id);
        }
        await pinningService.removePersonaPin(id);
        return;
    }

    await db.personalities.delete(id);
    await pinningService.removePersonaPin(id);
}

function insert(personality: Personality, id: string) {
    const personalitiesDiv = document.querySelector("#personalitiesDiv");
    if (!personalitiesDiv) {
        return
    }
    const card = generateCard(personality, id);
    personalitiesDiv.append(card);
    
    //move the add card to be the last element
    const addCard = document.querySelector("#btn-add-personality");
    if (addCard) {
        personalitiesDiv.appendChild(addCard);
    }
    return card;
}

function insertWithSync(personality: Personality, id: string, syncInfo: SyncInfo) {
    const personalitiesDiv = document.querySelector("#personalitiesDiv");
    if (!personalitiesDiv) {
        return
    }
    const card = generateCard(personality, id, syncInfo);
    personalitiesDiv.append(card);
    
    //move the add card to be the last element
    const addCard = document.querySelector("#btn-add-personality");
    if (addCard) {
        personalitiesDiv.appendChild(addCard);
    }
    return card;
}

export function share(personality: Personality & { id?: string }, explicitId?: string) {
    //export personality to a string
    const id = explicitId && explicitId !== "-1" ? explicitId : undefined;
    const payload = id ? { id, ...personality } : { ...personality };
    const personalityString = JSON.stringify(payload, null, 2)
    //download
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(personalityString));
    element.setAttribute('download', `${personality.name}.json`);
    element.style.display = 'none';
    //appending the element is required for firefox
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);

    info({
        title: 'Persona exported',
        text: `Exported "${personality.name}".`
    });
}

const MARKETPLACE_URL = 'https://zodiac-marketplace.com/';

export function createAddPersonalityCard() {
    const card = document.createElement("div");
    card.classList.add("card-personality", "card-add-personality");
    card.id = "btn-add-personality";
    card.innerHTML = `
        <div class="add-personality-content">
            <span class="material-symbols-outlined add-icon">add</span>
        </div>
    `;

    card.addEventListener("click", () => {
        showAddPersonaModal();
    });

    return card;
}

function showAddPersonaModal() {
    const modal = document.querySelector<HTMLElement>("#modal-add-persona");
    const overlay = document.querySelector<HTMLElement>(".overlay");
    if (!modal || !overlay) return;

    //hide other overlay items first
    const overlayContent = overlay.querySelector('.overlay-content');
    if (overlayContent) {
        Array.from(overlayContent.children).forEach(child => {
            if (child !== modal) {
                child.classList.add('hidden');
            }
        });
    }

    //show the overlay and modal with proper animation
    showElement(overlay, false);
    showElement(modal, false);
}

export function initAddPersonaModalHandlers() {
    const modal = document.querySelector<HTMLElement>("#modal-add-persona");
    if (!modal) return;

    const localBtn = modal.querySelector<HTMLButtonElement>(".add-persona-local-btn");
    const marketplaceBtn = modal.querySelector<HTMLButtonElement>(".add-persona-marketplace-btn");
    const overlay = document.querySelector<HTMLElement>(".overlay");

    localBtn?.addEventListener('click', () => {
        //hide this modal and show the add personality form
        modal.classList.add('hidden');
        overlayService.showAddPersonalityForm();
    });

    marketplaceBtn?.addEventListener('click', () => {
        //close the overlay and open marketplace in new tab
        modal.classList.add('hidden');
        overlay?.classList.add('hidden');
        window.open(MARKETPLACE_URL, '_blank');
    });
}

export async function removeAll() {
    if (syncService.isOnlineSyncEnabled()) {
        if (!syncService.isSyncActive()) return;
        const personas = await fetchSyncedPersonasCached(true);
        for (const persona of personas) {
            await syncService.deleteSyncedPersona(persona.id);
        }
        invalidateSyncedPersonasCache();
    } else {
        await db.personalities.clear();
    }
    await pinningService.clearPersonaPins();
    const personalityElements = document.querySelector<HTMLDivElement>("#personalitiesDiv")!.children;
    for (let i = personalityElements.length - 1; i >= 0; i--) {
        const element = personalityElements[i];
        if (element.id !== "btn-add-personality" && element.id) {
            element.remove();
        }
    }

    window.dispatchEvent(new CustomEvent('persona-list-updated'));
}

export async function add(personality: Personality, explicitId?: string): Promise<boolean> {
    //check if this persona comes from marketplace
    //marketplace exports include syncedFrom field with the marketplace ID
    const importedPersona = personality as any;
    const marketplaceId = importedPersona.syncedFrom || null;
    
    //for marketplace personas, use marketplace ID; otherwise use explicit or generate new
    const id = marketplaceId 
        ? marketplaceId 
        : (explicitId && explicitId !== "-1" ? explicitId : uuidv4());
    
    //check if persona with this ID already exists
    const existing = syncService.isOnlineSyncEnabled()
        ? (await fetchSyncedPersonasCached()).find((p) => p.id === id)
        : await db.personalities.get(id);
    if (existing) {
        info({ title: 'Already imported', text: `"${personality.name}" is already in your library` });
        return false;
    }
    
    const now = Date.now();
    const personaToSave: DbPersonality = {
        ...(structuredClone(personality) as Personality),
        id,
        dateAdded: now,
        lastModified: now,
    };
    
    if (marketplaceId) {
        const marketplaceInfo = await getMarketplacePersonaVersion(marketplaceId);
        if (marketplaceInfo.exists) {
            //this is a marketplace persona - set up sync tracking
            personaToSave.syncedFrom = marketplaceId;
            personaToSave.version = importedPersona.version ?? marketplaceInfo.version;
            personaToSave.localModifications = false;
        }
    } else if (explicitId && explicitId !== "-1") {
        //fallback: check if the explicit ID itself is a marketplace ID
        const marketplaceInfo = await getMarketplacePersonaVersion(explicitId);
        if (marketplaceInfo.exists) {
            personaToSave.syncedFrom = explicitId;
            personaToSave.version = marketplaceInfo.version;
            personaToSave.localModifications = false;
        }
    }
    
    //add new persona
    if (syncService.isOnlineSyncEnabled()) {
        if (!syncService.isSyncActive()) {
            danger({ title: 'Sync locked', text: 'Unlock cloud sync before adding personas.' });
            return false;
        }
        const syncedOk = await syncService.pushPersona(personaToSave);
        if (!syncedOk) {
            danger({ title: 'Sync failed', text: 'Failed to save persona to cloud.' });
            return false;
        }
        upsertCachedSyncedPersona(personaToSave);
    } else {
        await db.personalities.add(personaToSave);
    }
    await reloadFromDb();
    return true;
}

export async function edit(id: string, personality: Personality) {
    //check if this is a synced personality from marketplace
    const existing = syncService.isOnlineSyncEnabled()
        ? (await fetchSyncedPersonasCached()).find((p) => p.id === id)
        : await db.personalities.get(id);
    const updateData: Partial<DbPersonality> = {
        ...personality,
        lastModified: Date.now(),
    };
    
    //if synced from marketplace, set version to 0 to mark as locally modified
    if (existing?.syncedFrom) {
        updateData.version = 0;
    }

    if (syncService.isOnlineSyncEnabled()) {
        if (!syncService.isSyncActive()) {
            danger({ title: 'Sync locked', text: 'Unlock cloud sync before editing personas.' });
            return;
        }
        if (!existing) return;
        const merged = normalizePersonaTimestamps({ ...(existing as DbPersonality), ...updateData, id });
        const syncedOk = await syncService.pushPersona(merged);
        if (!syncedOk) {
            danger({ title: 'Sync failed', text: 'Failed to update persona in cloud.' });
            return;
        }
        upsertCachedSyncedPersona(merged);
    } else {
        await db.personalities.update(id, updateData);
    }

    await reloadFromDb();

    //reselect the personality if it was selected prior
    document.querySelector(`#personality-${id}`)?.querySelector("input")?.click();
}

export function generateCard(personality: Personality, id: string, syncInfo?: SyncInfo) {
    const card = document.createElement("label");
    card.classList.add("card-personality");
    if (id && id !== "-1") {
        card.id = `personality-${id}`;
    }

    //generate sync badge HTML based on status
    const getBadgeHtml = () => {
        if (!syncInfo || syncInfo.status === 'local') {
            return '<span class="sync-badge sync-badge-local">Local</span>';
        }
        switch (syncInfo.status) {
            case 'up-to-date':
                return '<span class="sync-badge sync-badge-uptodate">Up to date</span>';
            case 'outdated':
                return '<span class="sync-badge sync-badge-outdated" role="button" tabindex="0">Outdated</span>';
            case 'deleted':
                return '<span class="sync-badge sync-badge-deleted">Removed</span>';
            default:
                return '';
        }
    };

    card.innerHTML = `
            <img class="background-img" src="${personality.image}"></img>
            <input  type="radio" name="personality" value="${personality.name}">
            <div class="btn-array-personalityactions">
                ${id ? `<button class="btn-textual btn-pin-card material-symbols-outlined" title="Pin persona">keep</button>` : ''}
                ${id ? `<button class="btn-textual btn-edit-card material-symbols-outlined" 
                    id="btn-edit-personality-${personality.name}">edit</button>` : ''}
                <button class="btn-textual btn-share-card material-symbols-outlined" 
                    id="btn-share-personality-${personality.name}">share</button>
                ${id ? `<button class="btn-textual btn-delete-card material-symbols-outlined"
                    id="btn-delete-personality-${personality.name}">delete</button>` : ''}
            </div>
            <div class="personality-info">
                <div class="personality-header">
                    <h3 class="personality-title">${personality.name}</h3>
                    ${getBadgeHtml()}
                </div>
                <p class="personality-description">${personality.description}</p>
            </div>
            `;

    // Add event listeners
    const shareButton = card.querySelector(".btn-share-card");
    const deleteButton = card.querySelector(".btn-delete-card");
    const editButton = card.querySelector(".btn-edit-card");
    const pinButton = card.querySelector<HTMLButtonElement>(".btn-pin-card");
    const input = card.querySelector("input");
    const outdatedBadge = card.querySelector(".sync-badge-outdated");

    const updatePinButtonUi = () => {
        if (!pinButton || !id) return;
        const isPinned = pinningService.isPersonaPinned(id);
        pinButton.textContent = isPinned ? "keep_off" : "keep";
        pinButton.classList.toggle("active", isPinned);
        pinButton.title = isPinned ? "Unpin persona" : "Pin persona";
    };

    updatePinButtonUi();

    if (pinButton && id) {
        pinButton.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const wasSelected = !!input?.checked;
            await pinningService.togglePersonaPinned(id);
            updatePinButtonUi();
            await reloadFromDb();
            if (wasSelected) {
                document.querySelector<HTMLInputElement>(`#personality-${id} input[name='personality']`)?.click();
            }
        });
    }

    shareButton?.addEventListener("click", () => {
        share(personality, id);
    });
    if (deleteButton) {
        deleteButton.addEventListener("click", () => {
            //first if the personality to delete is the one currently selected, we select the default personality
            if (input?.checked) {
                document.querySelector<HTMLInputElement>("#personalitiesDiv .card-personality:not([id]) input[name='personality']")?.click();
            }
            if (id && id != "-1") {
                remove(id);
            }
            card.remove();
        });
    }
    if (editButton) {
        editButton.addEventListener("click", async () => {
            overlayService.showEditPersonalityForm(personality, id);
        });
    }
    //handle outdated badge click - show update modal
    if (outdatedBadge) {
        const handleOutdatedClick = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            const dbPersonality = personality as DbPersonality;
            if (dbPersonality.syncedFrom) {
                overlayService.showSyncUpdateModal(dbPersonality, id, syncInfo?.remoteVersion ?? 1);
            }
        };
        outdatedBadge.addEventListener("click", handleOutdatedClick);
        outdatedBadge.addEventListener("keydown", (e) => {
            if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
                handleOutdatedClick(e);
            }
        });
    }
    // Persist selection when user changes personality
    if (input) {
        input.addEventListener("change", () => {
            if (input.checked) {
                setLastSelectedPersonalityId(id || "-1");
            }
        });
    }
    return card;
}

// -------------------- Persistence helpers --------------------
function setLastSelectedPersonalityId(id: string) {
    try {
        localStorage.setItem("lastSelectedPersonalityId", id);
    } catch { /* ignore quota / privacy mode errors */ }
}

function getLastSelectedPersonalityId(): string | null {
    try {
        return localStorage.getItem("lastSelectedPersonalityId");
    } catch { return null; }
}

// -------------------- Sync Update Handlers --------------------

/**
 * Update a local persona from marketplace with latest data.
 * Preserves the local ID but updates all other fields.
 */
export async function updateFromMarketplace(localId: string, marketplaceId: string): Promise<boolean> {
    const marketplaceData = await fetchMarketplacePersona(marketplaceId);
    if (!marketplaceData) {
        danger({ title: "Update Failed", text: "Could not fetch persona from marketplace." });
        return false;
    }

    const existing = await db.table('personalities').get(localId) as DbPersonality | undefined;
    const now = Date.now();

    //map marketplace fields to local DbPersonality format
    const updatedPersona: DbPersonality = {
        id: localId,
        name: marketplaceData.name,
        image: marketplaceData.image_url ?? '',
        description: marketplaceData.description ?? '',
        prompt: marketplaceData.prompt ?? '',
        aggressiveness: marketplaceData.aggressiveness ?? 1,
        sensuality: marketplaceData.sensuality ?? 1,
        independence: marketplaceData.independence ?? 1,
        nsfw: marketplaceData.is_nsfw ?? false,
        internetEnabled: false,
        roleplayEnabled: true,
        toneExamples: marketplaceData.tone_examples ?? [],
        tags: marketplaceData.tags ?? [],
        category: marketplaceData.category ?? 'assistant',
        syncedFrom: marketplaceId,
        version: marketplaceData.version,
        localModifications: false,
        dateAdded: existing?.dateAdded ?? now,
        lastModified: now,
    };

    await db.table('personalities').put(updatedPersona);
    info({ title: "Persona Updated", text: `${marketplaceData.name} has been updated to version ${marketplaceData.version}.` });
    return true;
}

/**
 * Duplicate an existing persona with a new ID and "old - " prefix, 
 * then update the original from marketplace.
 */
export async function duplicateAndUpdate(localId: string, marketplaceId: string): Promise<boolean> {
    //get current local data
    const current = await db.table('personalities').get(localId) as DbPersonality | undefined;
    if (!current) {
        danger({ title: "Duplicate Failed", text: "Could not find the local persona." });
        return false;
    }

    //create duplicate with new ID and "old - " prefix
    const duplicateId = uuidv4();
    const now = Date.now();
    const duplicate: DbPersonality = {
        ...current,
        id: duplicateId,
        name: `old - ${current.name}`,
        syncedFrom: undefined, //no longer linked to marketplace
        version: undefined,
        localModifications: false,
        dateAdded: now,
        lastModified: now,
    };

    await db.table('personalities').put(duplicate);

    //now update the original
    const updated = await updateFromMarketplace(localId, marketplaceId);
    if (updated) {
        //insert the duplicate card to the list
        insert(duplicate, duplicateId);
    }
    return updated;
}

/**
 * Initialize sync modal button handlers. Call once on app load.
 */
export function initSyncModalHandlers() {
    const modal = document.querySelector<HTMLElement>("#modal-sync-update");
    if (!modal) return;

    const updateBtn = modal.querySelector<HTMLButtonElement>(".sync-update-btn");
    const duplicateBtn = modal.querySelector<HTMLButtonElement>(".sync-duplicate-btn");

    updateBtn?.addEventListener('click', async () => {
        const localId = modal.dataset.localId;
        const remoteId = modal.dataset.remoteId;
        if (!localId || !remoteId) return;

        updateBtn.disabled = true;
        duplicateBtn!.disabled = true;

        const success = await updateFromMarketplace(localId, remoteId);
        if (success) {
            //refresh the card in the list
            await refreshCard(localId);
        }

        overlayService.closeOverlay();
        updateBtn.disabled = false;
        duplicateBtn!.disabled = false;
    });

    duplicateBtn?.addEventListener('click', async () => {
        const localId = modal.dataset.localId;
        const remoteId = modal.dataset.remoteId;
        if (!localId || !remoteId) return;

        updateBtn!.disabled = true;
        duplicateBtn.disabled = true;

        const success = await duplicateAndUpdate(localId, remoteId);
        if (success) {
            //refresh the updated card
            await refreshCard(localId);
        }

        overlayService.closeOverlay();
        updateBtn!.disabled = false;
        duplicateBtn.disabled = false;
    });
}

/**
 * Refresh a persona card after update by replacing it in place.
 */
async function refreshCard(id: string) {
    const personality = await db.table('personalities').get(id) as DbPersonality | undefined;
    if (!personality) return;

    //find old card by its id attribute
    const oldCard = document.querySelector<HTMLElement>(`#personality-${id}`);
    if (!oldCard) return;

    //get sync info
    const syncMap = await getMarketplacePersonaVersions(personality.syncedFrom ? [personality.syncedFrom] : []);
    let syncInfo: SyncInfo = { status: 'local' };
    
    if (personality.syncedFrom) {
        const marketplaceInfo = syncMap.get(personality.syncedFrom);
        //if marketplace info unavailable (e.g., logged out), treat as local
        if (!marketplaceInfo || !marketplaceInfo.exists) {
            syncInfo = { status: 'local' };
        } else if (personality.version === 0 || (personality.version ?? 0) < marketplaceInfo.version) {
            syncInfo = { status: 'outdated', remoteVersion: marketplaceInfo.version };
        } else {
            syncInfo = { status: 'up-to-date', remoteVersion: marketplaceInfo.version };
        }
    }

    //generate new card and replace old one in place
    const newCard = generateCard(personality, id, syncInfo);
    oldCard.replaceWith(newCard);
}

/**
 * Setup marketplace banner dismiss functionality
 */
function setupMarketplaceBanner() {
    const banner = document.querySelector<HTMLElement>('#marketplace-banner');
    const dismissBtn = document.querySelector<HTMLButtonElement>('#btn-dismiss-marketplace-banner');
    
    if (!banner || !dismissBtn) return;
    
    //check if banner was dismissed
    const dismissed = localStorage.getItem('marketplace-banner-dismissed');
    if (dismissed === 'true') {
        banner.classList.add('hidden');
        return;
    }
    
    //handle dismiss button click
    dismissBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        localStorage.setItem('marketplace-banner-dismissed', 'true');
        banner.classList.add('hidden');
    });
}
