import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/whatsapp/encryption';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: config, error } = await supabase
      .from('meta_ads_config')
      .select('page_access_token')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!config || !config.page_access_token) {
      return NextResponse.json({ error: 'Meta Ads not configured' }, { status: 400 });
    }

    const token = decrypt(config.page_access_token);
    
    const url = new URL('https://graph.facebook.com/v20.0/me/accounts');
    url.searchParams.append('access_token', token);
    url.searchParams.append('fields', 'id,name');
    url.searchParams.append('limit', '100');

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to fetch pages from Meta');
    }

    return NextResponse.json(data.data || []);
  } catch (error) {
    console.error('Error syncing meta pages:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal error' }, { status: 500 });
  }
}
