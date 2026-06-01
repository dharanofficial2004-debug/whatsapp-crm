import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/whatsapp/encryption';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('page_id');

    if (!pageId) {
      return NextResponse.json({ error: 'page_id is required' }, { status: 400 });
    }

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

    const userToken = decrypt(config.page_access_token);
    
    // Fetch page access token from /me/accounts
    const accountsUrl = new URL('https://graph.facebook.com/v20.0/me/accounts');
    accountsUrl.searchParams.append('access_token', userToken);
    accountsUrl.searchParams.append('limit', '100');

    const accountsRes = await fetch(accountsUrl.toString());
    const accountsData = await accountsRes.json();

    if (!accountsRes.ok) {
      throw new Error(accountsData.error?.message || 'Failed to fetch accounts list from Meta');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = accountsData.data?.find((p: any) => p.id === pageId);
    if (!page) {
      return NextResponse.json({ error: `Page ${pageId} not found or not managed by your account` }, { status: 404 });
    }

    const pageToken = page.access_token;
    
    const url = new URL(`https://graph.facebook.com/v20.0/${pageId}/leadgen_forms`);
    url.searchParams.append('access_token', pageToken);
    url.searchParams.append('fields', 'id,name,status,questions');
    url.searchParams.append('limit', '100');

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to fetch forms from Meta');
    }

    return NextResponse.json(data.data || []);
  } catch (error) {
    console.error('Error syncing meta forms:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal error' }, { status: 500 });
  }
}
