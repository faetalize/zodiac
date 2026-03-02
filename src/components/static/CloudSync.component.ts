/**
 * Cloud Sync UI component.
 *
 * Handles:
 * - First-time sync prompt modal (after Pro/Max subscription)
 * - Encryption password setup modal
 * - Session unlock modal (enter password every login)
 * - Settings page "Cloud Sync" section (toggle, quota bar, sync now, wipe)
 *
 * Static component: auto-loaded at startup via import.meta.glob.
 */

import * as syncService from '../../services/Sync.service';
import * as cryptoService from '../../services/Crypto.service';
import * as chatsService from '../../services/Chats.service';
import * as personalityService from '../../services/Personality.service';
import * as settingsService from '../../services/Settings.service';
import { themeService } from '../../services/Theme.service';
import * as loraService from '../../services/Lora.service';
import { dispatchEmptyAppEvent } from '../../events';
import { onAppEvent } from '../../events';
import type { SyncStatus } from '../../events';
import { info, danger } from '../../services/Toast.service';
import { showElement, hideElement, confirmDialog, confirmDialogDanger } from '../../utils/helpers';
import { getSubscriptionTier, getUserSubscription } from '../../services/Supabase.service';

// ── DOM Elements ───────────────────────────────────────────────────────────

// Sync prompt modal (first-time "Enable or Keep Local")
const syncPromptModal = document.querySelector<HTMLElement>('#sync-prompt-modal');
const btnSyncPromptEnable = document.querySelector<HTMLButtonElement>('#btn-sync-prompt-enable');
const btnSyncPromptLocal = document.querySelector<HTMLButtonElement>('#btn-sync-prompt-local');

// Encryption password modal (setup + unlock)
const syncModal = document.querySelector<HTMLElement>('#sync-modal');
const syncModalTitle = document.querySelector<HTMLElement>('#sync-modal-title');
const syncModalDescription = document.querySelector<HTMLElement>('#sync-modal-description');
const syncPasswordInput = document.querySelector<HTMLInputElement>('#sync-password');
const syncPasswordConfirm = document.querySelector<HTMLInputElement>('#sync-password-confirm');
const syncModalError = document.querySelector<HTMLElement>('#sync-modal-error');
const btnSyncConfirm = document.querySelector<HTMLButtonElement>('#btn-sync-confirm');
const btnSyncSkip = document.querySelector<HTMLButtonElement>('#btn-sync-skip');

// Settings page elements
const cloudSyncSection = document.querySelector<HTMLElement>('#cloud-sync-section');
const syncToggle = document.querySelector<HTMLInputElement>('#sync-toggle');
const syncStatusLabel = document.querySelector<HTMLElement>('#sync-status-label');
const syncStatusIndicator = document.querySelector<HTMLElement>('#sync-status-indicator');
const syncDetails = document.querySelector<HTMLElement>('#sync-details');
const syncQuotaFill = document.querySelector<HTMLElement>('#sync-quota-fill');
const syncQuotaLabel = document.querySelector<HTMLElement>('#sync-quota-label');
const btnSyncNow = document.querySelector<HTMLButtonElement>('#btn-sync-now');
const btnSyncWipe = document.querySelector<HTMLButtonElement>('#btn-sync-wipe');
const syncUpgradeHint = document.querySelector<HTMLElement>('#sync-upgrade-hint');

// ── State ──────────────────────────────────────────────────────────────────

/** Track current modal mode to handle confirm button correctly. */
let modalMode: 'setup' | 'unlock' | 'enable' = 'setup';

// ── Helpers ────────────────────────────────────────────────────────────────

function showModal(el: HTMLElement | null) {
    if (!el) return;
    el.classList.remove('hidden');
}

function hideModal(el: HTMLElement | null) {
    if (!el) return;
    el.classList.add('hidden');
}

function showError(msg: string) {
    if (!syncModalError) return;
    syncModalError.textContent = msg;
    syncModalError.classList.remove('hidden');
}

function clearError() {
    if (!syncModalError) return;
    syncModalError.textContent = '';
    syncModalError.classList.add('hidden');
}

function resetModalFields() {
    if (syncPasswordInput) syncPasswordInput.value = '';
    if (syncPasswordConfirm) syncPasswordConfirm.value = '';
    clearError();
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ── Sync Prompt Modal (first-time offer) ───────────────────────────────────

function showSyncPrompt() {
    showModal(syncPromptModal);
}

btnSyncPromptEnable?.addEventListener('click', () => {
    hideModal(syncPromptModal);
    syncService.markSyncPromptSeen();
    showSetupModal();
});

btnSyncPromptLocal?.addEventListener('click', () => {
    hideModal(syncPromptModal);
    syncService.markSyncPromptSeen();
    info({ title: 'Data stays local', text: 'You can enable cloud sync anytime from Settings → Data Management.' });
});

// ── Encryption Password Modal ──────────────────────────────────────────────

function showSetupModal() {
    modalMode = 'setup';
    resetModalFields();
    if (syncModalTitle) syncModalTitle.textContent = 'Create Encryption Password';
    if (syncModalDescription) syncModalDescription.textContent =
        'Your data is encrypted on your device before syncing. For maximum security, local chat/persona data is deleted after migration and used in-memory only while unlocked. This password cannot be recovered if lost.';
    syncPasswordConfirm?.classList.remove('hidden');
    if (btnSyncSkip) btnSyncSkip.textContent = 'Cancel';
    showModal(syncModal);
}

function showUnlockModal() {
    modalMode = 'unlock';
    resetModalFields();
    if (syncModalTitle) syncModalTitle.textContent = 'Unlock Synced Data';
    if (syncModalDescription) syncModalDescription.textContent =
        'Enter your encryption password to access your synced data.';
    syncPasswordConfirm?.classList.add('hidden');
    if (btnSyncSkip) btnSyncSkip.textContent = 'Skip';
    showModal(syncModal);
}

function showEnableModal() {
    modalMode = 'enable';
    resetModalFields();
    if (syncModalTitle) syncModalTitle.textContent = 'Enter Encryption Password';
    if (syncModalDescription) syncModalDescription.textContent =
        'Enter your encryption password to re-enable cloud sync.';
    syncPasswordConfirm?.classList.add('hidden');
    if (btnSyncSkip) btnSyncSkip.textContent = 'Cancel';
    showModal(syncModal);
}

btnSyncConfirm?.addEventListener('click', async () => {
    const password = syncPasswordInput?.value ?? '';

    if (!password) {
        showError('Password is required.');
        return;
    }

    if (modalMode === 'setup') {
        const confirm = syncPasswordConfirm?.value ?? '';
        if (password !== confirm) {
            showError('Passwords do not match.');
            return;
        }
        if (password.length < 8) {
            showError('Password must be at least 8 characters.');
            return;
        }

        btnSyncConfirm!.disabled = true;
        btnSyncConfirm!.textContent = 'Setting up…';

        try {
            const success = await syncService.setupSync(password);

            if (success) {
                hideModal(syncModal);
                info({ title: 'Cloud sync enabled', text: 'Migration complete. Local chat/persona data was deleted for maximum security; synced data now loads in-memory per session.' });
                updateSettingsUI(true);
            } else {
                showError('Setup failed. Please try again.');
            }
        } finally {
            btnSyncConfirm!.disabled = false;
            btnSyncConfirm!.textContent = 'Confirm';
        }
    } else if (modalMode === 'unlock') {
        btnSyncConfirm!.disabled = true;
        btnSyncConfirm!.textContent = 'Unlocking…';

        try {
            const success = await syncService.unlock(password);

            if (success) {
                hideModal(syncModal);
                await syncService.applySyncedSettingsToLocalStorage();
                settingsService.loadSettings();
                themeService.reloadFromStorage();
                await loraService.initialize();
                dispatchEmptyAppEvent('lora-state-changed');
                await chatsService.initialize();
                await personalityService.reloadFromDb();
                info({ title: 'Sync unlocked', text: 'Your synced data is available for this session (in-memory only).' });
            } else {
                showError('Incorrect password. Please try again.');
            }
        } finally {
            btnSyncConfirm!.disabled = false;
            btnSyncConfirm!.textContent = 'Confirm';
        }
    } else if (modalMode === 'enable') {
        btnSyncConfirm!.disabled = true;
        btnSyncConfirm!.textContent = 'Enabling…';

        try {
            const success = await syncService.enableSync(password);

            if (success) {
                hideModal(syncModal);
                info({ title: 'Cloud sync re-enabled', text: 'Syncing your data now.' });
                updateSettingsUI(true);
            } else {
                showError('Incorrect password. Please try again.');
            }
        } finally {
            btnSyncConfirm!.disabled = false;
            btnSyncConfirm!.textContent = 'Confirm';
        }
    }
});

btnSyncSkip?.addEventListener('click', () => {
    hideModal(syncModal);
    resetModalFields();
});

// Allow Enter key to confirm
syncPasswordInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnSyncConfirm?.click();
});
syncPasswordConfirm?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnSyncConfirm?.click();
});

// ── Settings Page: Cloud Sync Toggle & Controls ────────────────────────────

function updateSettingsUI(syncEnabled: boolean) {
    if (!syncToggle || !syncDetails || !syncStatusLabel) return;

    syncToggle.checked = syncEnabled;
    syncDetails?.classList.toggle('hidden', !syncEnabled);
    syncStatusLabel.textContent = syncEnabled ? 'Enabled' : 'Disabled';
}

syncToggle?.addEventListener('change', async () => {
    const checked = syncToggle.checked;

    if (checked) {
        // Enabling sync
        const prefs = await syncService.fetchSyncPreferences();
        if (prefs?.encryptionSalt) {
            // Has existing encryption material — re-enable with password
            syncToggle.checked = false; // Reset until confirmed
            showEnableModal();
        } else {
            // First time — full setup
            syncToggle.checked = false; // Reset until confirmed
            showSetupModal();
        }
    } else {
        // Disabling sync
        const keepLocalCopy = await confirmDialog('Cloud sync is online-only. Do you want to save an unencrypted local copy before disabling sync?', {
            okText: 'Save Local Copy',
            cancelText: 'Disable Without Copy',
        });
        const success = await syncService.disableSync({ keepLocalCopy });
        if (success) {
            updateSettingsUI(false);
            info({ title: 'Cloud sync disabled', text: keepLocalCopy ? 'Local unencrypted copy restored. Cloud sync is now off.' : 'Cloud sync is now off. Data remains encrypted on the server.' });
        } else {
            syncToggle.checked = true; // Revert
            danger({ title: 'Error', text: 'Failed to disable cloud sync.' });
        }
    }
});

btnSyncNow?.addEventListener('click', async () => {
    if (!syncService.isSyncActive()) {
        danger({ title: 'Sync not active', text: 'Please unlock sync first.' });
        return;
    }

    btnSyncNow!.disabled = true;
    btnSyncNow!.innerHTML = '<span class="material-symbols-outlined">sync</span> Syncing…';

    await syncService.pushAll();
    await chatsService.initialize();
    await personalityService.reloadFromDb();

    btnSyncNow!.disabled = false;
    btnSyncNow!.innerHTML = '<span class="material-symbols-outlined">sync</span> Sync Now';

    info({ title: 'Sync complete', text: 'All data has been synchronized.' });
});

btnSyncWipe?.addEventListener('click', async () => {
    // Confirm before wiping
    const shouldWipe = await confirmDialogDanger('This will permanently delete ALL your synced data from the cloud and reset your encryption password. This cannot be undone. Continue?');
    if (!shouldWipe) {
        return;
    }

    const keepLocalCopy = await confirmDialog('Before wiping remote data, do you want to save an unencrypted local copy on this device?', {
        okText: 'Save Local Copy',
        cancelText: 'Wipe Without Copy',
    });
    const success = await syncService.wipeRemoteData({ keepLocalCopy });
    if (success) {
        updateSettingsUI(false);
        info({ title: 'Cloud data wiped', text: keepLocalCopy ? 'Remote data deleted. Local unencrypted copy was restored.' : 'All synced data has been removed from the server.' });
    } else {
        danger({ title: 'Error', text: 'Failed to wipe cloud data.' });
    }
});

// ── Quota display ──────────────────────────────────────────────────────────

function updateQuotaUI(usedBytes: number, quotaBytes: number) {
    if (!syncQuotaFill || !syncQuotaLabel) return;
    const pct = quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 0;
    syncQuotaFill.style.width = `${pct}%`;
    syncQuotaLabel.textContent = `${formatBytes(usedBytes)} / ${formatBytes(quotaBytes)}`;
}

// ── Sync status indicator ──────────────────────────────────────────────────

function updateStatusIndicator(status: SyncStatus) {
    if (!syncStatusIndicator) return;

    syncStatusIndicator.className = 'sync-status-dot';
    switch (status) {
        case 'idle':
            syncStatusIndicator.classList.add('sync-status-idle');
            break;
        case 'syncing':
            syncStatusIndicator.classList.add('sync-status-syncing');
            break;
        case 'synced':
            syncStatusIndicator.classList.add('sync-status-synced');
            break;
        case 'error':
            syncStatusIndicator.classList.add('sync-status-error');
            break;
        case 'offline':
            syncStatusIndicator.classList.add('sync-status-offline');
            break;
    }
}

// ── Event Listeners ────────────────────────────────────────────────────────

// Auth state: check if user is Pro/Max and show/hide sync section
onAppEvent('auth-state-changed', async (event) => {
    const { loggedIn, subscription } = event.detail;

    if (!loggedIn) {
        // Hide sync section, reset state
        cloudSyncSection?.classList.add('hidden');
        cryptoService.clearCachedKey();
        return;
    }

    const tier = getSubscriptionTier(subscription ?? null);
    const isPaid = tier === 'pro' || tier === 'max';

    if (isPaid && cloudSyncSection) {
        cloudSyncSection.classList.remove('hidden');
        syncUpgradeHint?.classList.add('hidden');
        syncToggle?.removeAttribute('disabled');

        // Load current sync state
        const prefs = await syncService.fetchSyncPreferences();
        updateSettingsUI(prefs?.syncEnabled ?? false);

        if (prefs?.syncEnabled) {
            await syncService.fetchSyncQuota();
        }

        // During onboarding, cloud sync setup is handled inside onboarding flow.
        // Avoid showing separate modals that occlude the onboarding UI.
        const onboardingCompleted = localStorage.getItem('onboardingCompleted') === 'true';
        if (!onboardingCompleted) {
            return;
        }

        // Trigger unlock/setup prompt for paid users on login
        await syncService.checkSyncOnLogin();
    } else if (cloudSyncSection) {
        cloudSyncSection.classList.remove('hidden');
        syncUpgradeHint?.classList.remove('hidden');
        syncToggle?.setAttribute('disabled', 'true');
    }
});

// Sync unlock required: show appropriate modal
onAppEvent('sync-unlock-required', async (event) => {
    const { isFirstSetup, mode } = event.detail;
    const resolvedMode = mode ?? (isFirstSetup ? 'setup' : 'unlock');

    if (resolvedMode === 'setup') {
        showSyncPrompt();
        return;
    }

    if (resolvedMode === 'enable') {
        const shouldEnable = await confirmDialog(
            'Cloud sync is currently disabled, but encrypted cloud data exists. Do you want to re-enable cloud sync?',
            {
                okText: 'Re-enable Sync',
                cancelText: 'Keep Disabled',
            }
        );

        if (shouldEnable) {
            showEnableModal();
        } else {
            info({ title: 'Cloud sync remains disabled', text: 'You can re-enable it anytime from Settings → Data Management.' });
        }
        return;
    }

    showUnlockModal();
});

// Sync state changed: update indicator
onAppEvent('sync-state-changed', (event) => {
    updateStatusIndicator(event.detail.status);
});

// Quota updated: update progress bar
onAppEvent('sync-quota-updated', (event) => {
    updateQuotaUI(event.detail.usedBytes, event.detail.quotaBytes);
});

// Sync setup complete: update settings toggle
onAppEvent('sync-setup-complete', (event) => {
    updateSettingsUI(event.detail.enabled);
    if (event.detail.enabled) {
        syncService.fetchSyncQuota();
    }
});

onAppEvent('sync-data-pulled', async () => {
    const currentChatId = chatsService.getCurrentChatId();

    settingsService.loadSettings();
    themeService.reloadFromStorage();
    await loraService.initialize();
    dispatchEmptyAppEvent('lora-state-changed');
    await chatsService.initialize();
    await personalityService.reloadFromDb();

    if (currentChatId) {
        const currentChatInput = document.querySelector<HTMLInputElement>(`input[value='chat${currentChatId}']`);
        if (currentChatInput) {
            currentChatInput.checked = true;
            await chatsService.loadChat(currentChatId);
        }
    }
});

// Subscription updated: show/hide sync section
onAppEvent('subscription-updated', async (event) => {
    const tier = event.detail.tier;
    const isPaid = tier === 'pro' || tier === 'max';

    if (cloudSyncSection) {
        cloudSyncSection.classList.remove('hidden');
    }

    if (isPaid) {
        syncUpgradeHint?.classList.add('hidden');
        syncToggle?.removeAttribute('disabled');
    } else {
        syncUpgradeHint?.classList.remove('hidden');
        syncToggle?.setAttribute('disabled', 'true');
        if (syncToggle) syncToggle.checked = false;
        syncDetails?.classList.add('hidden');
    }
});
