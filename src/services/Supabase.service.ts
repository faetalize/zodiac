import { createClient, RealtimeChannel } from '@supabase/supabase-js'
import { User } from "../models/User";

export const supabase = createClient('https://hglcltvwunzynnzduauy.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnbGNsdHZ3dW56eW5uemR1YXV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM3MTIzOTIsImV4cCI6MjA2OTI4ODM5Mn0.q4VZu-0vEZVdjSXAhlSogB9ihfPVwero0S4UFVCvMDQ');

supabase.auth.onAuthStateChange((event, session) => {
    let subscription: RealtimeChannel;
    //on login
    if (event === 'SIGNED_IN') {
        //on profile change
        subscription = supabase.channel("profile_updates").on(
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
            (el as HTMLElement).style.display = 'block';
        });
        document.querySelectorAll('.logged-out-component').forEach(el => {
            (el as HTMLElement).style.display = 'none';
        });

        const profile = getUserProfile().then(
            (profile) => {
                if(profile.avatar) {
                    getTempPfpUrl(profile.avatar).then((url) => {
                        document.querySelector("#profile-pfp")?.setAttribute("src", url);
                        document.querySelector("#user-profile")?.setAttribute("src", url);
                    });
                }
                document.querySelector<HTMLInputElement>("#profile-preferred-name")!.value = profile.preferredName;
                document.querySelector<HTMLTextAreaElement>("#profile-system-prompt")!.defaultValue = profile.systemPromptAddition;
            }
        );
    } else if (event === 'SIGNED_OUT') {
        document.querySelectorAll('.logged-out-component').forEach(el => {
            (el as HTMLElement).style.display = 'block';
        });
        document.querySelectorAll('.logged-in-component').forEach(el => {
            (el as HTMLElement).style.display = 'none';
        });
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