import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt, encrypt } from '@/lib/whatsapp/encryption';

const MASKED_TOKEN = '••••••••••••••••';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('meta_ads_config')
    .select('id, meta_app_id, page_id, ad_account_id, is_active')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data) {
    // Return masked tokens to the client
    return NextResponse.json({
      ...data,
      meta_app_secret: MASKED_TOKEN,
      page_access_token: MASKED_TOKEN,
    });
  }

  return NextResponse.json(null);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { meta_app_id, meta_app_secret, page_access_token, verify_token, ad_account_id, is_active } = body;

  if (!meta_app_id) {
    return NextResponse.json({ error: 'Missing Meta App ID' }, { status: 400 });
  }

  // Load existing config if any
  const { data: existing } = await supabase
    .from('meta_ads_config')
    .select('id, page_id, page_access_token')
    .eq('user_id', user.id)
    .maybeSingle();

  // If this is a new config (no existing row), we require the tokens
  if (!existing) {
    if (!meta_app_secret || !page_access_token || meta_app_secret === MASKED_TOKEN || page_access_token === MASKED_TOKEN) {
      return NextResponse.json({ error: 'App Secret and Access Token are required for initial setup' }, { status: 400 });
    }
  }

  let finalToken: string | null = null;
  if (page_access_token && page_access_token !== MASKED_TOKEN) {
    finalToken = page_access_token.trim();
  } else if (existing) {
    try {
      finalToken = decrypt(existing.page_access_token);
    } catch {
      // Decrypt failed
    }
  }

  let resolvedPageIds = '';
  if (finalToken) {
    try {
      // Fetch pages using the token
      const url = new URL('https://graph.facebook.com/v20.0/me/accounts');
      url.searchParams.append('access_token', finalToken);
      url.searchParams.append('limit', '100');

      const res = await fetch(url.toString());
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to fetch pages from Meta');
      }
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pages = data.data || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolvedPageIds = pages.map((p: any) => p.id).join(',');
    } catch (err) {
      console.error('Error fetching pages during config save:', err);
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to validate Access Token with Meta' }, { status: 400 });
    }
  }

  // If we resolved page IDs, save them, otherwise keep existing if we had one
  const pageIdToSave = resolvedPageIds || (existing ? existing.page_id : '');

  if (!pageIdToSave && finalToken) {
    return NextResponse.json({ error: 'The provided token has access to 0 Facebook Pages. Please manage at least one page.' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    meta_app_id,
    page_id: pageIdToSave,
    ad_account_id: ad_account_id || null,
    is_active: is_active ?? true,
    updated_at: new Date().toISOString(),
  };

  if (verify_token) {
    updates.verify_token = encrypt(verify_token);
  }

  // Only update secrets if they were provided and not masked
  if (meta_app_secret && meta_app_secret !== MASKED_TOKEN) {
    updates.meta_app_secret = encrypt(meta_app_secret);
  }
  
  if (page_access_token && page_access_token !== MASKED_TOKEN) {
    updates.page_access_token = encrypt(page_access_token);
  }

  if (!existing) {
    const { error } = await supabase
      .from('meta_ads_config')
      .insert({
        user_id: user.id,
        ...updates
      });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase
      .from('meta_ads_config')
      .update(updates)
      .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('meta_ads_config')
    .delete()
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
