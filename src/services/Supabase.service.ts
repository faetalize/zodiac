import { createClient, RealtimeChannel, Session, User as SupabaseUser } from '@supabase/supabase-js'
import { User } from "../models/User";
import { SubscriptionPriceIDs } from '../models/Price';
import { ImageGenerationPermitted } from '../models/ImageGenerationTypes';

let userCache: SupabaseUser | null = null;

export const SUPABASE_URL = 'https://hglcltvwunzynnzduauy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnbGNsdHZ3dW56eW5uemR1YXV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM3MTIzOTIsImV4cCI6MjA2OTI4ODM5Mn0.q4VZu-0vEZVdjSXAhlSogB9ihfPVwero0S4UFVCvMDQ';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getAuthHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
        return { Authorization: `Bearer ${session.access_token}` };
    }
    return {};
}

supabase.auth.onAuthStateChange((event, session) => {
    //on login
    if (event === 'SIGNED_IN' && session) {
        console.log("User signed in.");
        //cache user
        userCache = session.user;
        //show relevant components
        document.querySelectorAll('.logged-in-component').forEach(el => {
            (el as HTMLElement).classList.remove('hidden');
        });
        document.querySelectorAll('.logged-out-component').forEach(el => {
            (el as HTMLElement).classList.add('hidden');
        });
        //initial profile load
        getUserProfile().then(
            (profile) => {
                if (profile.avatar) {
                    document.querySelector("#profile-pfp")?.setAttribute("src", profile.avatar);
                    document.querySelector("#user-profile")?.setAttribute("src", profile.avatar);
                }
                document.querySelector<HTMLInputElement>("#profile-preferred-name")!.value = profile.preferredName;
                document.querySelector<HTMLTextAreaElement>("#profile-system-prompt")!.defaultValue = profile.systemPromptAddition;
                getUserSubscription(session).then((sub) => {
                    // notify listeners
                    try { window.dispatchEvent(new CustomEvent('auth-state-changed', { detail: { loggedIn: true, session, subscription: sub } })); } catch (e) { console.error(e); }
                    getImageGenerationRecord().then((imageGenRecord) => {
                        updateSubscriptionUI(session, sub, imageGenRecord);
                    });
                });
            }
        );
    } else if (event === 'SIGNED_OUT') {
        console.log("User signed out.");
        try { window.dispatchEvent(new CustomEvent('auth-state-changed', { detail: { loggedIn: false } })); } catch (e) { console.error(e); }
        //clear cached user
        userCache = null;
        //hide relevant components
        document.querySelectorAll('.logged-out-component').forEach(el => {
            (el as HTMLElement).classList.remove('hidden');
        });
        document.querySelectorAll('.logged-in-component').forEach(el => {
            (el as HTMLElement).classList.add('hidden');
        });
        // reset subscription UI
        const badge = document.querySelector<HTMLElement>('#subscription-badge');
        const manageBtn = document.querySelector<HTMLButtonElement>('#btn-manage-subscription');
        const tierEl = document.querySelector<HTMLElement>('#subscription-tier-text');
        const periodEndEl = document.querySelector<HTMLElement>('#subscription-period-end');
        if (badge) {
            badge.textContent = 'Free';
            badge.classList.remove('badge-tier-pro', 'badge-tier-max');
            badge.classList.add('badge-tier-free');
        }
        if (manageBtn) {
            manageBtn.classList.add('hidden');
            manageBtn.onclick = null;
        }
        if (tierEl) {
            tierEl.textContent = 'Free';
        }
        if (periodEndEl) {
            periodEndEl.textContent = '—';
        }

        // Treat signed-out as Free tier for settings UI
        const apiKeyInput = document.querySelector<HTMLInputElement>('#apiKeyInput');
        const noNeedMsg = document.querySelector<HTMLElement>('#apiKeyNoNeedMsg');
        const orDivider = document.querySelector<HTMLElement>('#or-divider');
        const upgradeBtn = document.querySelector<HTMLButtonElement>('#btn-show-subscription-options');
        const apiKeyError = document.querySelector<HTMLElement>('.api-key-error');
        if (apiKeyInput) {
            apiKeyInput.disabled = false;
            apiKeyInput.classList.remove('api-key-invalid', 'api-key-valid');
        }
        if (apiKeyError) apiKeyError.classList.add('hidden');
        if (noNeedMsg) noNeedMsg.classList.add('hidden');
        if (orDivider) orDivider.classList.remove('hidden');
        if (upgradeBtn) upgradeBtn.classList.remove('hidden');
        // Treat as free tier for any listeners
        try { window.dispatchEvent(new CustomEvent('subscription-updated', { detail: { tier: 'free' } })); } catch { }
    } else if (event === 'TOKEN_REFRESHED' && session) {
        console.log("Token refreshed.");
        //update cached user
        userCache = session.user;
    } else if (event === 'USER_UPDATED' && session) {
        console.log("User update event.");
        //update cached user
        userCache = session.user;
    }
});

export async function createAccount(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password
    });
    if (error) {
        console.error("Sign up error:", error.message);
        throw new Error(error.message);
    }
    return data;
}

export async function login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
    });
    if (error) {
        console.error("Login error:", error.message);
        throw new Error(error.message);
    }
    return data;
}

export async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error("Logout error:", error.message);
        throw new Error(error.message);
    }
    userCache = null;
    return true;
}

export async function getCurrentUser() {
    //to prevent multiple network calls, we can cache the user in memory and only fetch if not present
    if (userCache) return userCache;
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
        console.error("Get current user error:", error.message);
        return null;
    }
    userCache = user;
    return user;
}

export async function uploadPfpToSupabase(file: File) {
    //we wanna create a folder for each user
    const file_ending = file.name.split('.').pop();
    const user = await getCurrentUser();
    if (!user) {
        throw new Error("User not found");
    }
    const { data, error } = await supabase.storage.from('profile_pictures').upload(`${user.id}/profile_picture.${file_ending}`, file, {
        upsert: true,
    });
    if (error) {
        console.error("Upload error:", error.message);
        throw new Error(error.message);
    }
    return data.fullPath;
}

export async function updateUser(user: User) {
    //we update user's profile in supabase in profile table
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        throw new Error("User not found");
    }
    return supabase.from('profiles').update(user).eq('user_id', currentUser.id);
}

export async function getUserProfile() {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        throw new Error("User not found");
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('user_id', currentUser.id).single();
    if (error) {
        console.error("Get user profile error:", error.message);
        throw new Error(error.message);
    }
    return data as User;
}

// Subscription helpers
export type SubscriptionTier = 'free' | 'pro' | 'max' | 'canceled';

export interface UserSubscription {
    id: string;
    user_id: string;
    status: string;
    price_id: string | null;
    current_period_end?: string | number | null;
    remaining_image_generations?: number | null;
    cancel_at_period_end?: boolean | null;
    stripe_customer_id?: string | null;
    [key: string]: unknown;
}

export interface ImageGenerationRecord {
    user_id: string;
    remaining_image_generations: number | null;
    [key: string]: unknown;
}

export async function getCurrentUserEmail(): Promise<string | null> {
    const user = await getCurrentUser();
    return user?.email ?? null;
}

export async function getUserSubscription(session?: Session): Promise<UserSubscription | null> {
    const currentUser = session?.user || await getCurrentUser();
    if (!currentUser) return null;
    const { data, error } = await supabase
        .from('user_subscriptions')
        .select('user_id,status,price_id,current_period_end,remaining_image_generations, cancel_at_period_end, stripe_customer_id')
        .eq('user_id', currentUser.id)
        .order('current_period_end', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) {
        console.error('Get user subscription error:', error.message);
        return null;
    }
    return (data as UserSubscription) ?? null;
}

export async function getImageGenerationRecord(): Promise<ImageGenerationRecord | null> {
    const currentUser = await getCurrentUser();
    if (!currentUser) return null;
    const { data, error } = await supabase
        .from('image_generations')
        .select('user_id, remaining_image_generations')
        .eq('user_id', currentUser.id)
        .limit(1)
        .maybeSingle();
    if (error) {
        console.error('Get image generation record error:', error.message);
        return null;
    }
    return data;
}

export function getSubscriptionTier(sub: UserSubscription | null): SubscriptionTier {
    // treat non-active as free
    if (!sub || !sub.status || !['active', 'trialing', 'past_due', 'canceled'].includes(String(sub.status))) {
        return 'free';
    }
    if (['canceled', 'incomplete_expired', 'unpaid'].includes(String(sub.status))) {
        return 'canceled';
    }
    switch (sub.price_id) {
        case 'price_1S0heGGiJrKwXclR69Ku7XEc':
        case SubscriptionPriceIDs.MAX_MONTHLY:
        case SubscriptionPriceIDs.MAX_YEARLY:
            return 'max';
        case 'price_1S0hdiGiJrKwXclRByeNLSPu':
        case SubscriptionPriceIDs.PRO_MONTHLY:
        case SubscriptionPriceIDs.PRO_YEARLY:
            return 'pro';
        default:
            return 'free';
    }
}

export function getBillingPortalUrlWithEmail(email: string | null): string {
    const base = 'https://billing.stripe.com/p/login/9B614n85JdKwgNP2Yv2kw00';
    if (!email) return base;
    const param = encodeURIComponent(email);
    return `${base}?prefilled_email=${param}`;
}

export async function updateSubscriptionUI(session: Session | null, sub: UserSubscription | null, imageGenerationRecord: ImageGenerationRecord | null): Promise<void> {
    try {
        const email = session?.user.email ?? await getCurrentUserEmail();
        const tier = getSubscriptionTier(sub);

        const cancelAtPeriodEnd = sub?.cancel_at_period_end;
        const badge = document.querySelector<HTMLElement>('#subscription-badge');
        const manageBtn = document.querySelector<HTMLButtonElement>('#btn-manage-subscription');
        const tierEl = document.querySelector<HTMLElement>('#subscription-tier-text');
        const periodEndEl = document.querySelector<HTMLElement>('#subscription-period-end');
        const remainingGenerationsEl = document.querySelector<HTMLElement>('#subscription-remaining-generations');
        const tierLabel = tier === 'free' ? 'Free' : tier === 'pro' ? 'Pro' : tier === 'max' ? 'Max' : 'Canceled';
        const subscriptionrenewalDateLabel = document.querySelector<HTMLElement>('#subscription-renewal-date-label');
        let periodEndLabel = '—';
        const rawEnd = sub?.current_period_end ?? null;
        if (rawEnd) {
            const d = new Date(rawEnd as string);
            if (!isNaN(d.getTime())) {
                periodEndLabel = d.toLocaleDateString();
            }
        }
        if (badge) {
            badge.textContent = tierLabel;
            badge.classList.remove('badge-tier-free', 'badge-tier-pro', 'badge-tier-max');
            badge.classList.add(`badge-tier-${tier}`);
        }
        if (tierEl) {
            tierEl.textContent = tierLabel;
        }
        if (periodEndEl) {
            periodEndEl.textContent = periodEndLabel;
        }
        if (remainingGenerationsEl) {
            remainingGenerationsEl.textContent = imageGenerationRecord?.remaining_image_generations != null ? String(imageGenerationRecord.remaining_image_generations) : '—';
        }
        if (manageBtn) {
            if (tier === 'free') {
                manageBtn.classList.add('hidden');
                manageBtn.onclick = null;
            } else {
                manageBtn.classList.remove('hidden');
                manageBtn.onclick = async (e) => {
                    e.preventDefault();
                    console.log('Opening billing portal for user:', email, "with stripe customer ID:", sub?.stripe_customer_id);
                    console.log(sub)
                    const { data } = await supabase.functions.invoke("return-stripe-customer-portal", {
                        method: 'POST',
                        body: JSON.stringify({ stripeCustomerId: sub?.stripe_customer_id }) // assuming user_id maps to stripe customer ID
                    });
                    if (data) {
                        window.open(data.url, '_blank', 'noopener');
                    } else {
                        console.error('Failed to retrieve billing portal URL');
                    }
                };
            }
        }
        if (subscriptionrenewalDateLabel) {
            if (tier === 'canceled' || cancelAtPeriodEnd) {
                subscriptionrenewalDateLabel.textContent = 'Will end on';
            }
            else {
                subscriptionrenewalDateLabel.textContent = 'Renewal date';
            }
        }

        // Toggle Settings section based on subscription tier
        const apiKeyInput = document.querySelector<HTMLInputElement>('#apiKeyInput');
        const noNeedMsg = document.querySelector<HTMLElement>('#apiKeyNoNeedMsg');
        const orDivider = document.querySelector<HTMLElement>('#or-divider');
        const upgradeBtn = document.querySelector<HTMLButtonElement>('#btn-show-subscription-options');
        const apiKeyError = document.querySelector<HTMLElement>('.api-key-error');

        const isSubscribed = tier === 'pro' || tier === 'max';
        // Leave API key input enable/disable and hint visibility to the API key component based on route
        if (apiKeyInput && isSubscribed) {
            apiKeyInput.classList.remove('api-key-invalid');
            if (apiKeyError) apiKeyError.classList.add('hidden');
        }
        if (orDivider) orDivider.classList.toggle('hidden', isSubscribed);
        if (upgradeBtn) upgradeBtn.classList.toggle('hidden', isSubscribed);
        // Notify listeners so UI can react without reload
        try { window.dispatchEvent(new CustomEvent('subscription-updated', { detail: { tier } })); } catch { }
    } catch (err) {
        console.error('Error updating subscription UI:', err);
    }
}

/**
 * Determines if image generation is available based on subscription and settings.
 */
export async function isImageGenerationAvailable(): Promise<ImageGenerationPermitted> {
    try {
        const imageGenerationRecord = await getImageGenerationRecord();
        if (!imageGenerationRecord) return { enabled: true, type: "google_only" }; //free tier, assume available (with API key)
        if (imageGenerationRecord?.remaining_image_generations && imageGenerationRecord?.remaining_image_generations > 0) {
            return { enabled: true, type: "all" }; //Has credits, can use premium endpoints + Google
        }
        //Has record but no credits (0 or null) - can still use Google with API key
        return { enabled: true, type: "google_only" };
    } catch {
        //If not logged in or error, assume available (probably Free tier with API key)
        return { enabled: true, type: "google_only" };
    }
}

export async function refreshAll() {
    refreshProfile();
    refreshSubscription();
}


export async function refreshProfile() {
    try {
        const profile = await getUserProfile();
        window.dispatchEvent(new CustomEvent('profile-refreshed', { detail: { user: profile } }));
    } catch (error) {
        console.error('Error refreshing profile:', error);
    }
}

export async function refreshSubscription() {
    try {
        const subscriptionDetails = await getUserSubscription();
        if (!subscriptionDetails) return;
        window.dispatchEvent(new CustomEvent('subscription-refreshed', { detail: { subDetails: subscriptionDetails } }));
    } catch (error) {
        console.error('Error refreshing subscription:', error);
    }
}
