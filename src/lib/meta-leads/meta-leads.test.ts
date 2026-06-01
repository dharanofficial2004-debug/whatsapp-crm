import { describe, expect, it, vi, beforeEach } from 'vitest';
import { extractContactFields, processMetaLead } from './meta-leads';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { engineSendTemplate } from '@/lib/automations/meta-send';
import { runAutomationsForTrigger } from '@/lib/automations/engine';

vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: vi.fn(),
}));

vi.mock('@/lib/automations/meta-send', () => ({
  engineSendTemplate: vi.fn(),
}));

vi.mock('@/lib/automations/engine', () => ({
  runAutomationsForTrigger: vi.fn().mockResolvedValue(undefined),
}));

describe('extractContactFields', () => {
  it('extracts phone, name, and email from field_data', () => {
    const mockLead = {
      id: 'lead123',
      created_time: '2026-06-01T00:00:00Z',
      field_data: [
        { name: 'full_name', values: ['John Doe'] },
        { name: 'phone_number', values: ['+14155551212'] },
        { name: 'email', values: ['john@example.com'] },
      ],
    };
    const fields = extractContactFields(mockLead as any);
    expect(fields).toEqual({
      phone: '14155551212',
      name: 'John Doe',
      email: 'john@example.com',
    });
  });

  it('handles partial or missing data gracefully', () => {
    const mockLead = {
      id: 'lead123',
      created_time: '2026-06-01T00:00:00Z',
      field_data: [
        { name: 'phone', values: [] },
      ],
    };
    const fields = extractContactFields(mockLead as any);
    expect(fields).toEqual({
      phone: null,
      name: null,
      email: null,
    });
  });
});

describe('processMetaLead', () => {
  const config = {
    id: 'config-123',
    user_id: 'user-456',
    meta_app_id: 'app-789',
    meta_app_secret: 'secret-abc',
    page_id: 'page-xyz',
    page_access_token: 'token-def',
    is_active: true,
  };

  const mockLeadData = {
    id: 'leadgen-999',
    created_time: '2026-06-01T00:00:00Z',
    form_name: 'Test Form',
    campaign_name: 'Summer Campaign',
    ad_id: 'ad-000',
    field_data: [
      { name: 'full_name', values: ['Alice Smith'] },
      { name: 'phone_number', values: ['+15550199'] },
      { name: 'email', values: ['alice@example.com'] },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockLeadData,
    } as Response);
  });

  it('fully processes a lead, creates contact, sends template and logs event', async () => {
    const mockFrom = vi.fn();
    const mockSelect = vi.fn();
    const mockInsert = vi.fn();
    const mockUpdate = vi.fn();
    const mockUpsert = vi.fn();
    const mockEq = vi.fn();
    const mockIn = vi.fn();
    const mockOrder = vi.fn();
    const mockMaybeSingle = vi.fn();
    const mockSingle = vi.fn();

    // Mock chaining
    mockFrom.mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      upsert: mockUpsert,
    });

    mockSelect.mockReturnValue({
      eq: mockEq,
      insert: mockInsert,
      maybeSingle: mockMaybeSingle,
    });

    mockEq.mockImplementation((col, val) => {
      if (col === 'user_id') {
        return {
          eq: vi.fn().mockImplementation((col2, val2) => {
            if (col2 === 'contact_id') {
              return {
                single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
              };
            }
            return {
              single: vi.fn().mockResolvedValue({ data: null }),
            };
          }),
          in: mockIn,
        };
      }
      if (col === 'contact_id') {
        return {
          tag_id: vi.fn(),
        };
      }
      return {
        maybeSingle: mockMaybeSingle,
        single: mockSingle,
      };
    });

    mockIn.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: mockOrder,
      }),
    });

    // Mock database responses
    // Contacts: none initially
    mockSelect.mockImplementation((fields) => {
      return {
        eq: vi.fn().mockImplementation((col, val) => {
          if (col === 'user_id') {
            return {
              // Return list of contacts (empty)
              then: (resolve: any) => resolve({ data: [], error: null }),
            };
          }
          return {
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      };
    });

    // Insert contacts
    mockInsert.mockImplementation((data) => {
      return {
        select: () => ({
          single: () => ({
            then: (resolve: any) => resolve({ data: { id: 'new-contact-id', phone: '15550199', name: 'Alice Smith' }, error: null }),
          }),
        }),
        then: (resolve: any) => resolve({ data: [], error: null }),
      };
    });

    // Mock form configs lookup: returns template settings
    mockFrom.mockImplementation((table) => {
      if (table === 'contacts') {
        return {
          select: () => ({
            eq: () => ({
              then: (resolve: any) => resolve({ data: [], error: null }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: () => ({
                then: (resolve: any) => resolve({ data: { id: 'new-contact-id', phone: '15550199', name: 'Alice Smith' }, error: null }),
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              then: (resolve: any) => resolve({ data: null, error: null }),
            }),
          }),
        };
      }

      if (table === 'meta_lead_form_configs') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                eq: () => ({
                  order: () => ({
                    then: (resolve: any) => resolve({
                      data: [
                        {
                          id: 'form-config-id',
                          auto_tag_name: 'Summer Campaign Tag',
                          template_name: 'welcome_template',
                          template_language: 'en_US',
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'tags') {
        return {
          select: () => ({
            eq: () => ({
              ilike: () => ({
                maybeSingle: () => ({
                  then: (resolve: any) => resolve({ data: { id: 'tag-id' }, error: null }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'contact_tags') {
        return {
          upsert: () => ({
            then: (resolve: any) => resolve({ data: null, error: null }),
          }),
        };
      }

      if (table === 'conversations') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => ({
                  then: (resolve: any) => resolve({ data: { id: 'conversation-id' }, error: null }),
                }),
              }),
            }),
          }),
        };
      }

      // Default fallback mock
      return {
        select: () => ({
          eq: () => ({
            then: (resolve: any) => resolve({ data: [], error: null }),
          }),
        }),
        insert: () => ({
          then: (resolve: any) => resolve({ data: null, error: null }),
        }),
        upsert: () => ({
          then: (resolve: any) => resolve({ data: null, error: null }),
        }),
      };
    });

    (supabaseAdmin as any).mockReturnValue({
      from: mockFrom,
    });

    await processMetaLead(config as any, 'leadgen-999', 'form-123');

    // Verify template was sent with contact's name as parameter
    expect(engineSendTemplate).toHaveBeenCalledWith({
      userId: config.user_id,
      conversationId: 'conversation-id',
      contactId: 'new-contact-id',
      templateName: 'welcome_template',
      language: 'en_US',
      params: ['Alice Smith'],
    });

    // Verify automation trigger was fired
    expect(runAutomationsForTrigger).toHaveBeenCalledWith({
      userId: config.user_id,
      triggerType: 'meta_lead_form_submitted',
      contactId: 'new-contact-id',
      context: {
        vars: {
          form_id: 'form-123',
          form_name: 'Test Form',
          campaign_name: 'Summer Campaign',
          ad_id: 'ad-000',
        },
        lead: mockLeadData,
      },
    });
  });
});
