// ai-proxy — Supabase Edge Function
// Proxyt aanvragen naar de Anthropic API zodat de API-sleutel nooit in de browser terechtkomt.
// Deploy: supabase functions deploy ai-proxy
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  // Verificeer Supabase JWT
  const authHeader = req.headers.get('Authorization') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Niet ingelogd.' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY niet ingesteld op de server.' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Ongeldig JSON-body.' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }); }

  const upstream = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  // Geef de response (streaming of niet) direct door aan de client
  const responseHeaders: Record<string, string> = { ...CORS };
  const ct = upstream.headers.get('Content-Type');
  if (ct) responseHeaders['Content-Type'] = ct;

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
});
