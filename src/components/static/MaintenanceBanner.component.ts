import { getRemoteKeyValue } from "../../services/Supabase.service";

type MaintenanceBannerStyle = 'normal' | 'warning';

interface MaintenanceBannerConfig {
    enabled?: boolean;
    message?: string;
    style?: MaintenanceBannerStyle;
}

const maintenanceBannerElement = document.querySelector<HTMLDivElement>('#maintenance-banner');
const maintenanceBannerTextElement = document.querySelector<HTMLSpanElement>('#maintenance-banner-text');

if (!maintenanceBannerElement || !maintenanceBannerTextElement) {
    throw new Error('Missing DOM elements: #maintenance-banner or #maintenance-banner-text');
}

const maintenanceBanner = maintenanceBannerElement;
const maintenanceBannerText = maintenanceBannerTextElement;

function syncMaintenanceBannerHeight(): void {
    const bannerHeight = `${maintenanceBanner.offsetHeight}px`;
    document.documentElement.style.setProperty('--maintenance-banner-height', bannerHeight);
}

function isMaintenanceBannerStyle(value: unknown): value is MaintenanceBannerStyle {
    return value === 'normal' || value === 'warning';
}

function normalizeMaintenanceConfig(value: unknown): MaintenanceBannerConfig | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const raw = value as Record<string, unknown>;
    const normalized: MaintenanceBannerConfig = {};

    if (typeof raw.enabled === 'boolean') {
        normalized.enabled = raw.enabled;
    }

    if (typeof raw.message === 'string') {
        normalized.message = raw.message.trim();
    }

    if (isMaintenanceBannerStyle(raw.style)) {
        normalized.style = raw.style;
    }

    return normalized;
}

function hideMaintenanceBanner(): void {
    maintenanceBanner.classList.add('hidden');
    document.body.classList.remove('maintenance-banner-visible');
}

function showMaintenanceBanner(config: MaintenanceBannerConfig): void {
    const style = config.style ?? 'normal';
    const text = config.message || 'Maintenance is currently in progress.';

    maintenanceBannerText.textContent = text;
    maintenanceBanner.classList.toggle('maintenance-banner--warning', style === 'warning');
    maintenanceBanner.classList.toggle('maintenance-banner--normal', style === 'normal');
    maintenanceBanner.classList.remove('hidden');
    syncMaintenanceBannerHeight();
    document.body.classList.add('maintenance-banner-visible');
}

async function initializeMaintenanceBanner(): Promise<void> {
    const remoteValue = await getRemoteKeyValue<unknown>('maintenance_banner');
    const config = normalizeMaintenanceConfig(remoteValue);

    if (!config?.enabled) {
        hideMaintenanceBanner();
        return;
    }

    showMaintenanceBanner(config);
}

window.addEventListener('resize', () => {
    if (document.body.classList.contains('maintenance-banner-visible')) {
        syncMaintenanceBannerHeight();
    }
});

void initializeMaintenanceBanner();
