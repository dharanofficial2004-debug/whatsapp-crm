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
      .select('ad_account_id, page_access_token')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!config || !config.ad_account_id || !config.page_access_token) {
      return NextResponse.json({ error: 'Ad Account ID or Page Access Token not configured' }, { status: 400 });
    }

    const token = decrypt(config.page_access_token);
    // Usually ad_account_id looks like act_12345. Meta requires 'act_' prefix, but if user enters just numbers, prepend it.
    const accountId = config.ad_account_id.startsWith('act_') ? config.ad_account_id : `act_${config.ad_account_id}`;
    
    const url = new URL(`https://graph.facebook.com/v20.0/${accountId}/campaigns`);
    url.searchParams.append('access_token', token);
    url.searchParams.append('fields', 'id,name,status');
    url.searchParams.append('limit', '100'); // Can implement cursor pagination later if needed

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to fetch campaigns from Meta');
    }

    return NextResponse.json(data.data || []);
  } catch (error) {
    console.error('Error syncing meta campaigns:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal error' }, { status: 500 });
  }
}
