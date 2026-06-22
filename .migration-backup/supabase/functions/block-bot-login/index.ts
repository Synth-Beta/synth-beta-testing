/**
 * Security: Supabase Auth Hook — blocks normal client login for bot seed accounts.
 *
 * Configure in Supabase Dashboard → Authentication → Hooks → Before user signed in:
 *   URL: https://<project-ref>.supabase.co/functions/v1/block-bot-login
 *   Secret: set SUPABASE_AUTH_HOOK_SECRET (same value in function env)
 *
 * Bot cron jobs use service_role (not user JWT) and are unaffected.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const hookSecret = Deno.env.get('SUPABASE_AUTH_HOOK_SECRET')?.trim();
    const authHeader = req.headers.get('authorization') ?? '';
    if (hookSecret && authHeader !== `Bearer ${hookSecret}`) {
      console.warn('[block-bot-login] Invalid hook authorization');
      return new Response(JSON.stringify({ error: 'Unauthorized hook caller' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json();
    const userId: string | undefined =
      payload?.user?.id ?? payload?.record?.id ?? payload?.user_id;

    if (!userId) {
      return new Response(JSON.stringify({ decision: 'continue' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from('users')
      .select('is_bot')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[block-bot-login] users lookup failed:', error.message);
      return new Response(JSON.stringify({ decision: 'continue' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (data?.is_bot === true) {
      console.warn('[block-bot-login] Rejected bot sign-in attempt', userId);
      return new Response(
        JSON.stringify({
          decision: 'reject',
          message: 'This account cannot sign in.',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(JSON.stringify({ decision: 'continue' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[block-bot-login] Unhandled error:', err);
    return new Response(JSON.stringify({ decision: 'continue' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
