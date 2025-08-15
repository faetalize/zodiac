import { createClient } from '@supabase/supabase-js'
import { User } from "../models/User";

export const supabase = createClient('https://hglcltvwunzynnzduauy.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnbGNsdHZ3dW56eW5uemR1YXV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM3MTIzOTIsImV4cCI6MjA2OTI4ODM5Mn0.q4VZu-0vEZVdjSXAhlSogB9ihfPVwero0S4UFVCvMDQ');

supabase.auth.onAuthStateChange((event, session) => {
    //on login
    if (event === 'SIGNED_IN') {
        const metadata = (session?.user?.user_metadata) as User;
        if (!metadata) {
            console.error("User metadata not found");
            return;
        }
        document.querySelectorAll('.logged-in-component').forEach ( el => {
            (el as HTMLElement).style.display = 'block';
        });
        document.querySelectorAll('.logged-out-component').forEach ( el => {
            (el as HTMLElement).style.display = 'none';
        });
    //on logout
    } else if (event === 'SIGNED_OUT') {
        document.querySelectorAll('.logged-out-component').forEach ( el => {
            (el as HTMLElement).style.display = 'block';
        });
        document.querySelectorAll('.logged-in-component').forEach ( el => {
            (el as HTMLElement).style.display = 'none';
        });
    }
    //on user update
    else if (event === "USER_UPDATED") {
        const metadata = (session?.user?.user_metadata) as User;
        if (!metadata) {
            console.error("User metadata not found");
            return;
        }
        const userAvatar = document.querySelector<HTMLImageElement>(".user-avatar");
        if (userAvatar) {
            userAvatar.src = metadata.avatar || 'assets/avatar-default.svg';
        }
    }
});

export async function createAccount(email: string, password: string) {
    const { data, error} = await supabase.auth.signUp({
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

