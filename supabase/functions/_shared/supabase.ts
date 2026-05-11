import { createClient } from 'npm:@supabase/supabase-js@2';
import { bearerToken } from './http.ts';

export type IntegrationProvider = 'telegram' | 'slack' | 'browser';

export interface GoaldenUser {
  id: string;
  email?: string;
}

export function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing Supabase service configuration.');
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export async function requireUser(req: Request): Promise<GoaldenUser> {
  const token = bearerToken(req);
  if (!token) throw new Error('Missing Authorization bearer token.');

  const supabase = serviceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id) throw new Error('Invalid Supabase session.');

  return {
    id: data.user.id,
    email: data.user.email ?? undefined
  };
}

export function nowMs() {
  return Date.now();
}

export async function sha256Short(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .slice(0, 12)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}
