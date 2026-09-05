import { createClient } from "@supabase/supabase-js";

// Shared by the migration preflight and the app, without starting UI/auth hydration.
export const SUPABASE_URL = "https://hglcltvwunzynnzduauy.supabase.co";
const SUPABASE_ANON_KEY =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnbGNsdHZ3dW56eW5uemR1YXV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM3MTIzOTIsImV4cCI6MjA2OTI4ODM5Mn0.q4VZu-0vEZVdjSXAhlSogB9ihfPVwero0S4UFVCvMDQ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
