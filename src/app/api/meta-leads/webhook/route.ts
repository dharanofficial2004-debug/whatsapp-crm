import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { decrypt, encrypt, isLegacyFormat } from '@/lib/whatsapp/encryption';
import { verifyMetaWebhookSignature } from '@/lib/whatsapp/webhook-signature';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { processMetaLead } from '@/lib/meta-leads/meta-leads';

// Verify signature with a specific secret
function verifySignatureWithSecret(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('hub.mode');
    const challenge = searchParams.get('hub.challenge');
    const verifyToken = searchParams.get('hub.verify_token');

    if (mode !== 'subscribe' || !challenge || !verifyToken) {
      return NextResponse.json(
        { error: 'Missing verification parameters' },
        { status: 400 }
      );
    }

    const { data: configs, error } = await supabaseAdmin()
      .from('meta_ads_config')
      .select('id, verify_token');

    if (error || !configs) {
      console.error('Error fetching meta ads configs:', error);
      return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let matchedConfig: any = null;
    for (const config of configs) {
      if (!config.verify_token) continue;
      try {
        if (decrypt(config.verify_token) === verifyToken) {
          matchedConfig = config;
          break;
        }
      } catch {
        // Malformed token
      }
    }

    if (matchedConfig) {
      if (isLegacyFormat(matchedConfig.verify_token)) {
        void supabaseAdmin()
          .from('meta_ads_config')
          .update({ verify_token: encrypt(verifyToken) })
          .eq('id', matchedConfig.id)
          .then(({ error }: { error: unknown }) => {
            if (error) console.warn('[meta-leads webhook] verify_token upgrade failed:', error);
          });
      }
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    return NextResponse.json(
      { error: 'Verification token mismatch' },
      { status: 403 }
    );
  } catch (error) {
    console.error('Error in meta-leads GET verification:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  // We need to verify the signature. Meta sends the signature using the App Secret.
  // Since users can use their own Meta Apps, we might need their specific App Secret.
  // First, we parse the JSON to find the page_id, so we can look up the user's config.
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Expecting body.object === 'page' and entry array
  if (body.object !== 'page' || !body.entry) {
    return NextResponse.json({ status: 'received' }, { status: 200 }); // Ignore non-page events
  }

  // Look up config by page_id (which is usually entry[0].id)
  const pageId = body.entry[0]?.id;
  if (!pageId) {
    return NextResponse.json({ status: 'received' }, { status: 200 });
  }

  const { data: config, error } = await supabaseAdmin()
    .from('meta_ads_config')
    .select('*')
    .eq('page_id', pageId)
    .eq('is_active', true)
    .single();

  if (error || !config) {
    console.warn(`[meta-leads] No active config for page_id: ${pageId}`);
    return NextResponse.json({ status: 'received' }, { status: 200 });
  }

  // Verify signature using the user's app secret, OR the global fallback.
  let isValid = false;
  try {
    const userSecret = decrypt(config.meta_app_secret);
    isValid = verifySignatureWithSecret(rawBody, signature, userSecret);
  } catch (e) {
    console.warn('[meta-leads] Failed to decrypt user meta_app_secret', e);
  }

  if (!isValid) {
    // Fallback to global APP_SECRET just in case
    isValid = verifyMetaWebhookSignature(rawBody, signature);
  }

  if (!isValid) {
    console.warn('[meta-leads] rejected request with invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Process asynchronously
  processLeadgenEntries(body.entry, config).catch(e => {
    console.error('Error processing leadgen entries:', e);
  });

  return NextResponse.json({ status: 'received' }, { status: 200 });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processLeadgenEntries(entries: any[], config: any) {
  config.page_access_token = decrypt(config.page_access_token); // Decrypt once

  for (const entry of entries) {
    for (const change of (entry.changes || [])) {
      if (change.field === 'leadgen') {
        const leadgenId = change.value.leadgen_id;
        const formId = change.value.form_id;
        
        if (leadgenId) {
          await processMetaLead(config, leadgenId, formId);
        }
      }
    }
  }
}
