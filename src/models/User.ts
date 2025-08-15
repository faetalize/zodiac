import { UserMetadata } from "@supabase/supabase-js";

export interface User extends UserMetadata{
    avatar: string;
    preferredName: string;
    systemPromptAddition: string;
}