import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_SCHEMES = ['https:', 'http:'];
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Verify Supabase JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Niet ingelogd' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  );
  const { error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authError) {
    return new Response(JSON.stringify({ error: 'Ongeldige sessie' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get('url');
  if (!rawUrl) {
    return new Response(JSON.stringify({ error: 'url parameter ontbreekt' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(rawUrl.replace(/^webcal:\/\//i, 'https://'));
  } catch {
    return new Response(JSON.stringify({ error: 'Ongeldige URL' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!ALLOWED_SCHEMES.includes(targetUrl.protocol)) {
    return new Response(JSON.stringify({ error: 'Alleen http/https toegestaan' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const upstream = await fetch(targetUrl.toString(), {
      headers: { 'User-Agent': 'GezinsappProxy/1.0' },
      signal: AbortSignal.timeout(15_000),
    });

    const contentType = upstream.headers.get('content-type') || 'text/plain';
    const body = await upstream.arrayBuffer();

    if (body.byteLength > MAX_SIZE) {
      return new Response(JSON.stringify({ error: 'Bestand te groot (max 2 MB)' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(body, {
      status: upstream.status,
      headers: { ...corsHeaders, 'Content-Type': contentType },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: `Ophalen mislukt: ${e.message}` }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
