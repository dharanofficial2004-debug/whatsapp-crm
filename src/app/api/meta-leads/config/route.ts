import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/whatsapp/encryption';

const MASKED_TOKEN = '••••••••••••••••';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('meta_ads_config')
    .select('id, meta_app_id, page_id, is_active')
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
  const { meta_app_id, meta_app_secret, page_id, page_access_token, verify_token, is_active } = body;

  if (!meta_app_id || !page_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    meta_app_id,
    page_id,
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

  // If this is a new config (no existing row), we require the tokens
  const { data: existing } = await supabase
    .from('meta_ads_config')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!existing) {
    if (!updates.meta_app_secret || !updates.page_access_token) {
      return NextResponse.json({ error: 'App Secret and Page Access Token are required for initial setup' }, { status: 400 });
    }
    
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
