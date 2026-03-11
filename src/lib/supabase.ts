import { createClient } from '@supabase/supabase-js';

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Type definition for the database (to be generated later)
export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};

// Check if variables are defined (will throw error at runtime if missing)
if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Missing Supabase environment variables');
}

// Export initialized client
export const supabase = createClient<Database>(
  supabaseUrl || '',
  supabaseServiceKey || ''
);
