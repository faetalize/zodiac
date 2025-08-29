import { createClient, RealtimeChannel } from '@supabase/supabase-js'
import { User } from "../models/User";

export const supabase = createClient('https://hglcltvwunzynnzduauy.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnbGNsdHZ3dW56eW5uemR1YXV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM3MTIzOTIsImV4cCI6MjA2OTI4ODM5Mn0.q4VZu-0vEZVdjSXAhlSogB9ihfPVwero0S4UFVCvMDQ');

supabase.auth.onAuthStateChange((event, session) => {
    //on login
    if (event === 'SIGNED_IN') {
        //on profile change
        supabase.channel("profile_updates").on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'profiles' },
            async (payload) => {
                const newProfile = payload.new as User;
                const avatar_url = (payload.new as User).avatar;
                if (avatar_url) {
                    const tempURL = await getTempPfpUrl(avatar_url);
                    document.querySelector("#profile-pfp")?.setAttribute("src", tempURL);
                    document.querySelector("#user-profile")?.setAttribute("src", tempURL);

                }
                document.querySelector<HTMLInputElement>("#profile-preferred-name")!.value = newProfile.preferredName;
                document.querySelector<HTMLTextAreaElement>("#profile-system-prompt")!.defaultValue = newProfile.systemPromptAddition;
            }
        ).subscribe();

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
                    getTempPfpUrl(profile.avatar).then((url) => {
                        document.querySelector("#profile-pfp")?.setAttribute("src", url);
                        document.querySelector("#user-profile")?.setAttribute("src", url);
                    });
                }
                document.querySelector<HTMLInputElement>("#profile-preferred-name")!.value = profile.preferredName;
                document.querySelector<HTMLTextAreaElement>("#profile-system-prompt")!.defaultValue = profile.systemPromptAddition;
                updateSubscriptionUI();
            }
        );
    } else if (event === 'SIGNED_OUT') {
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
        supabase.removeAllChannels();
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
    return true;
}

export async function getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
        console.error("Get user error:", error.message);
        throw new Error(error.message);
    }
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

    return data.path;
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

export async function getTempPfpUrl(path: string) {
    //signed
    const { data, error } = await supabase.storage.from('profile_pictures').createSignedUrl(path, 3600);
    if (error) {
        console.error("Get temporary profile picture URL error:", error.message);
        throw new Error(error.message);
    }
    return data.signedUrl;
}

// Subscription helpers
export type SubscriptionTier = 'free' | 'pro' | 'max';

export interface UserSubscription {
    id: string;
    user_id: string;
    status: string;
    price_id: string | null;
    current_period_end?: string | number | null;
    [key: string]: unknown;
}

export async function getCurrentUserEmail(): Promise<string | null> {
    const user = await getCurrentUser();
    return user?.email ?? null;
}

export async function getUserSubscription(): Promise<UserSubscription | null> {
    const currentUser = await getCurrentUser();
    if (!currentUser) return null;
    const { data, error } = await supabase
        .from('user_subscriptions')
        .select('user_id,status,price_id,current_period_end')
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

export function getSubscriptionTier(sub: UserSubscription | null): SubscriptionTier {
    // treat non-active as free
    if (!sub || !sub.status || !['active', 'trialing', 'past_due', 'canceled'].includes(String(sub.status))) {
        return 'free';
    }
    switch (sub.price_id) {
        case 'price_1S0heGGiJrKwXclR69Ku7XEc':
            return 'max';
        case 'price_1S0hdiGiJrKwXclRByeNLSPu':
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

export async function updateSubscriptionUI(): Promise<void> {
    try {
        const [sub, email] = await Promise.all([
            getUserSubscription(),
            getCurrentUserEmail()
        ]);
        const tier = getSubscriptionTier(sub);
        const portalUrl = getBillingPortalUrlWithEmail(email);

        const badge = document.querySelector<HTMLElement>('#subscription-badge');
        const manageBtn = document.querySelector<HTMLButtonElement>('#btn-manage-subscription');
        const tierEl = document.querySelector<HTMLElement>('#subscription-tier-text');
        const periodEndEl = document.querySelector<HTMLElement>('#subscription-period-end');
        const tierLabel = tier === 'free' ? 'Free' : tier === 'pro' ? 'Pro' : 'Max';
        let periodEndLabel = '—';
        const rawEnd = sub?.current_period_end ?? null;
        if (rawEnd) {
            const asNumber = typeof rawEnd === 'string' ? Number(rawEnd) : Number(rawEnd);
            // If value looks like seconds, convert; if already ms, keep
            const ms = asNumber < 1e12 ? asNumber * 1000 : asNumber;
            const d = new Date(ms);
            if (!isNaN(d.getTime())) {
                periodEndLabel = d.toLocaleString();
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
        if (manageBtn) {
            if (tier === 'free') {
                manageBtn.classList.add('hidden');
                manageBtn.onclick = null;
            } else {
                manageBtn.classList.remove('hidden');
                manageBtn.onclick = (e) => {
                    e.preventDefault();
                    window.open(portalUrl, '_blank', 'noopener');
                };
            }
        }
    } catch (err) {
        console.error('Error updating subscription UI:', err);
    }
}