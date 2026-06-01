import { supabaseAdmin } from '@/lib/automations/admin-client';
import { normalizePhone, phonesMatch } from '@/lib/whatsapp/phone-utils';
import { engineSendTemplate } from '@/lib/automations/meta-send';
import { runAutomationsForTrigger } from '@/lib/automations/engine';
import type { MetaAdsConfig, MetaLeadEvent, MetaLeadFormConfig } from '@/types';

interface LeadFieldData {
  name: string;
  values: string[];
}

export interface MetaLeadData {
  id: string;
  created_time: string;
  ad_id?: string;
  form_id?: string;
  ad_name?: string;
  adset_name?: string;
  campaign_name?: string;
  form_name?: string;
  is_organic?: boolean;
  platform?: string;
  field_data: LeadFieldData[];
}

export interface ExtractedContactFields {
  phone: string | null;
  name: string | null;
  email: string | null;
}

export async function fetchLeadData(leadgenId: string, accessToken: string): Promise<MetaLeadData> {
  const url = new URL(`https://graph.facebook.com/v20.0/${leadgenId}`);
  url.searchParams.append('access_token', accessToken);
  
  // We can ask for specific fields if we want, but default usually includes field_data.
  // Better to explicitly request fields to get campaign/ad info.
  url.searchParams.append('fields', 'id,created_time,ad_id,form_id,ad_name,adset_name,campaign_name,form_name,is_organic,platform,field_data');

  const res = await fetch(url.toString());
  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(`Failed to fetch lead data from Meta: ${data.error?.message || 'Unknown error'}`);
  }
  
  return data as MetaLeadData;
}

export function extractContactFields(leadData: MetaLeadData): ExtractedContactFields {
  let phone: string | null = null;
  let name: string | null = null;
  let email: string | null = null;
  
  const fields = leadData.field_data || [];
  
  for (const field of fields) {
    const val = field.values?.[0];
    if (!val) continue;
    
    // Common meta field names
    const fieldName = field.name.toLowerCase();
    
    if (fieldName.includes('phone')) {
      phone = val;
    } else if (fieldName.includes('name')) {
      name = val;
    } else if (fieldName.includes('email')) {
      email = val;
    }
  }
  
  if (phone) {
    // Normalize to standard format for our CRM
    phone = normalizePhone(phone);
  }
  
  return { phone, name, email };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContactRow = any;

interface ContactOutcome {
  contact: ContactRow;
  wasCreated: boolean;
}

async function findOrCreateContact(
  userId: string,
  phone: string,
  name: string | null,
  email: string | null
): Promise<ContactOutcome | null> {
  const db = supabaseAdmin();
  
  // Look up existing contacts for this user
  const { data: contacts, error: contactsError } = await db
    .from('contacts')
    .select('*')
    .eq('user_id', userId);

  if (contactsError) {
    console.error('Error fetching contacts:', contactsError);
    return null;
  }

  const existingContact = contacts?.find((c: ContactRow) => phonesMatch(c.phone, phone));

  if (existingContact) {
    const updates: Record<string, unknown> = {};
    if (name && name !== existingContact.name) updates.name = name;
    if (email && email !== existingContact.email) updates.email = email;
    
    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      await db
        .from('contacts')
        .update(updates)
        .eq('id', existingContact.id);
    }
    return { contact: existingContact, wasCreated: false };
  }

  // Create new contact
  const { data: newContact, error: createError } = await db
    .from('contacts')
    .insert({
      user_id: userId,
      phone,
      name: name || phone,
      email: email || null
    })
    .select()
    .single();

  if (createError) {
    console.error('Error creating contact:', createError);
    return null;
  }

  return { contact: newContact, wasCreated: true };
}

async function findOrCreateConversation(userId: string, contactId: string) {
  const db = supabaseAdmin();
  const { data: existing, error: findError } = await db
    .from('conversations')
    .select('*')
    .eq('user_id', userId)
    .eq('contact_id', contactId)
    .single();

  if (!findError && existing) return existing;

  const { data: newConv, error: createError } = await db
    .from('conversations')
    .insert({ user_id: userId, contact_id: contactId })
    .select()
    .single();

  if (createError) {
    console.error('Error creating conversation:', createError);
    return null;
  }
  return newConv;
}

async function ensureTag(userId: string, tagName: string): Promise<string | null> {
  const db = supabaseAdmin();
  
  const { data: existing, error } = await db
    .from('tags')
    .select('id')
    .eq('user_id', userId)
    .ilike('name', tagName)
    .maybeSingle();
    
  if (error) {
    console.error('Error looking up tag:', error);
    return null;
  }
  
  if (existing) return existing.id;
  
  const { data: newTag, error: createError } = await db
    .from('tags')
    .insert({ user_id: userId, name: tagName })
    .select('id')
    .single();
    
  if (createError) {
    console.error('Error creating tag:', createError);
    return null;
  }
  
  return newTag.id;
}

export async function processMetaLead(
  config: MetaAdsConfig,
  leadgenId: string,
  formId: string
): Promise<void> {
  const db = supabaseAdmin();
  
  try {
    // 1. Fetch full lead data from Graph API
    const leadData = await fetchLeadData(leadgenId, config.page_access_token);
    
    const { phone, name, email } = extractContactFields(leadData);
    
    if (!phone) {
      throw new Error('Lead data did not contain a recognizable phone number');
    }
    
    // 2. Find or Create Contact
    const contactOutcome = await findOrCreateContact(config.user_id, phone, name, email);
    if (!contactOutcome) {
      throw new Error('Failed to find or create contact');
    }
    const contact = contactOutcome.contact;
    
    // 3. Find Form Config
    // First try specific form config, then fallback to catch-all (form_id = '')
    const { data: formConfigs } = await db
      .from('meta_lead_form_configs')
      .select('*')
      .eq('user_id', config.user_id)
      .in('form_id', [formId, ''])
      .eq('is_active', true)
      .order('form_id', { ascending: false }); // specific form config first
      
    const formConfig = formConfigs?.[0] as MetaLeadFormConfig | undefined;
    
    let templateSent = false;
    
    // 4. Process Form Config Actions (Tag & Template)
    if (formConfig) {
      // Auto Tag
      if (formConfig.auto_tag_name) {
        const tagId = await ensureTag(config.user_id, formConfig.auto_tag_name);
        if (tagId) {
          await db
            .from('contact_tags')
            .upsert({ contact_id: contact.id, tag_id: tagId }, { onConflict: 'contact_id,tag_id' });
        }
      }
      
      // Auto Template
      if (formConfig.template_name) {
        const conversation = await findOrCreateConversation(config.user_id, contact.id);
        if (conversation) {
          try {
            // For v1, pass the lead name as param 1 if it exists, otherwise empty string.
            // A more advanced version would use formConfig.template_variables mapping.
            const params = name ? [name] : [''];
            
            await engineSendTemplate({
              userId: config.user_id,
              conversationId: conversation.id,
              contactId: contact.id,
              templateName: formConfig.template_name,
              language: formConfig.template_language || 'en_US',
              params
            });
            templateSent = true;
          } catch (e) {
            console.error('Failed to send auto-reply template:', e);
          }
        }
      }
    }
    
    // 5. Log Event
    await db.from('meta_lead_events').insert({
      user_id: config.user_id,
      leadgen_id: leadgenId,
      form_id: formId,
      form_name: leadData.form_name,
      campaign_name: leadData.campaign_name,
      ad_id: leadData.ad_id,
      contact_id: contact.id,
      lead_data: leadData as unknown as Record<string, unknown>,
      status: 'processed',
      template_sent: templateSent
    });
    
    // 6. Fire Automations
    const automationCtx = {
      vars: {
        form_id: formId,
        form_name: leadData.form_name,
        campaign_name: leadData.campaign_name,
        ad_id: leadData.ad_id
      },
      lead: leadData // Make available for interpolation
    };
    
    if (contactOutcome.wasCreated) {
      await runAutomationsForTrigger({
        userId: config.user_id,
        triggerType: 'new_contact_created',
        contactId: contact.id,
        context: automationCtx
      }).catch(e => console.error('[automations] new_contact_created dispatch failed:', e));
    }
    
    await runAutomationsForTrigger({
      userId: config.user_id,
      triggerType: 'meta_lead_form_submitted',
      contactId: contact.id,
      context: automationCtx
    }).catch(e => console.error('[automations] meta_lead_form_submitted dispatch failed:', e));
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`Error processing meta lead ${leadgenId}:`, errorMsg);
    
    // Log failure
    await db.from('meta_lead_events').upsert({
      user_id: config.user_id,
      leadgen_id: leadgenId,
      form_id: formId,
      status: 'failed',
      error_message: errorMsg,
      template_sent: false
    }, { onConflict: 'leadgen_id' });
  }
}
