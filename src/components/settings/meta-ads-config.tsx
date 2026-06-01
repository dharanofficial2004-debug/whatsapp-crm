'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Zap,
  RotateCcw,
  Plus,
  Trash2,
  Megaphone
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';

const MASKED_TOKEN = '••••••••••••••••';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MetaAdsConfigType = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MetaLeadFormConfig = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MetaLeadEvent = any;

export function MetaAdsConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showToken, setShowToken] = useState(false);
  
  const [config, setConfig] = useState<MetaAdsConfigType | null>(null);
  
  const [metaAppId, setMetaAppId] = useState('');
  const [metaAppSecret, setMetaAppSecret] = useState('');
  const [adAccountId, setAdAccountId] = useState('');
  const [pageAccessToken, setPageAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [isActive, setIsActive] = useState(true);
  
  const [formConfigs, setFormConfigs] = useState<MetaLeadFormConfig[]>([]);
  const [recentEvents, setRecentEvents] = useState<MetaLeadEvent[]>([]);
  
  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/meta-leads/webhook`
      : '';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, formsRes, eventsRes] = await Promise.all([
        fetch('/api/meta-leads/config'),
        fetch('/api/meta-leads/forms'),
        fetch('/api/meta-leads/events?limit=5')
      ]);

      const configData = await configRes.json();
      if (configData && !configData.error) {
        setConfig(configData);
        setMetaAppId(configData.meta_app_id || '');
        setMetaAppSecret(configData.meta_app_secret || MASKED_TOKEN);
        setAdAccountId(configData.ad_account_id || '');
        setPageAccessToken(configData.page_access_token || MASKED_TOKEN);
        setIsActive(configData.is_active ?? true);
        setVerifyToken('');
      }

      const formsData = await formsRes.json();
      if (Array.isArray(formsData)) setFormConfigs(formsData);

      const eventsData = await eventsRes.json();
      if (Array.isArray(eventsData)) setRecentEvents(eventsData);
      
    } catch (err) {
      console.error('Failed to load meta ads data:', err);
      toast.error('Failed to load Meta Ads configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSave() {
    if (!metaAppId.trim()) {
      toast.error('Meta App ID is required');
      return;
    }
    if (!config && (!metaAppSecret.trim() || !pageAccessToken.trim())) {
      toast.error('App Secret and Access Token are required for initial setup');
      return;
    }

    try {
      setSaving(true);

      const payload: Record<string, unknown> = {
        meta_app_id: metaAppId.trim(),
        ad_account_id: adAccountId.trim(),
        is_active: isActive,
        verify_token: verifyToken.trim() || null,
      };

      if (metaAppSecret && metaAppSecret !== MASKED_TOKEN) {
        payload.meta_app_secret = metaAppSecret.trim();
      }
      if (pageAccessToken && pageAccessToken !== MASKED_TOKEN) {
        payload.page_access_token = pageAccessToken.trim();
      }

      const res = await fetch('/api/meta-leads/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to save configuration');
        return;
      }

      toast.success('Meta Ads configuration saved successfully');
      await fetchData();
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm('This will delete the Meta Ads config. Continue?')) return;

    try {
      setResetting(true);
      const res = await fetch('/api/meta-leads/config', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to reset');

      toast.success('Configuration cleared.');
      setConfig(null);
      setMetaAppId('');
      setMetaAppSecret('');
      setAdAccountId('');
      setPageAccessToken('');
      setVerifyToken('');
    } catch (err) {
      console.error('Reset error:', err);
      toast.error('Failed to reset configuration');
    } finally {
      setResetting(false);
    }
  }

  function handleCopyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('Webhook URL copied to clipboard');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-violet-500" />
      </div>
    );
  }

  const isConnected = !!config;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px] mt-4">
      {/* Main config form */}
      <div className="space-y-6">
        
        {/* Connection Status */}
        <Alert className="bg-slate-900 border-slate-700">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <CheckCircle2 className="size-4 text-violet-500" />
            ) : (
              <XCircle className="size-4 text-slate-500" />
            )}
            <AlertTitle className="text-white mb-0">
              {isConnected ? 'Configured' : 'Not Configured'}
            </AlertTitle>
          </div>
          <AlertDescription className="text-slate-400">
            {isConnected
              ? 'Your Meta Lead Ads integration is configured.'
              : 'Configure your Meta API credentials below to start receiving lead webhooks.'}
          </AlertDescription>
        </Alert>

        {/* API Credentials */}
        <Card className="bg-slate-900 border-slate-700 ring-0 ring-transparent">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white">API Credentials</CardTitle>
                <CardDescription className="text-slate-400">
                  Enter your Meta App and Facebook Page credentials.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Switch 
                  checked={isActive} 
                  onCheckedChange={setIsActive}
                />
                <span className="text-sm text-slate-400">{isActive ? 'Active' : 'Paused'}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-slate-300">Meta App ID</Label>
                <Input
                  value={metaAppId}
                  onChange={(e) => setMetaAppId(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Meta App Secret</Label>
                <div className="relative">
                  <Input
                    type={showSecret ? 'text' : 'password'}
                    value={metaAppSecret}
                    onChange={(e) => setMetaAppSecret(e.target.value)}
                    onFocus={() => { if (metaAppSecret === MASKED_TOKEN) setMetaAppSecret(''); }}
                    className="bg-slate-800 border-slate-700 text-white pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Access Token</Label>
              <div className="relative">
                <Input
                  type={showToken ? 'text' : 'password'}
                  value={pageAccessToken}
                  onChange={(e) => setPageAccessToken(e.target.value)}
                  onFocus={() => { if (pageAccessToken === MASKED_TOKEN) setPageAccessToken(''); }}
                  placeholder="Paste your System User or Page Access Token"
                  className="bg-slate-800 border-slate-700 text-white pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Provide a System User Access Token (or a Page Access Token) containing leads_retrieval, pages_manage_ads, and pages_read_engagement permissions.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-slate-300">Ad Account ID <span className="text-slate-500 font-normal">(Optional, for Campaign Sync)</span></Label>
                <Input
                  value={adAccountId}
                  onChange={(e) => setAdAccountId(e.target.value)}
                  placeholder="e.g. act_123456789"
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Webhook Verify Token</Label>
                <Input
                  placeholder="Create a custom verify token"
                  value={verifyToken}
                  onChange={(e) => setVerifyToken(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                />
                <p className="text-xs text-slate-500">
                  Must match the token you set in Meta webhook settings.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Webhook URL */}
        <Card className="bg-slate-900 border-slate-700 ring-0 ring-transparent">
          <CardHeader>
            <CardTitle className="text-white">Webhook Configuration</CardTitle>
            <CardDescription className="text-slate-400">
              Use this URL as your webhook callback in the Meta App Dashboard for Page webhooks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label className="text-slate-300">Webhook Callback URL</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={webhookUrl}
                  className="bg-slate-800 border-slate-700 text-slate-300 font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyWebhookUrl}
                  className="shrink-0 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            Save Configuration
          </Button>
          {config && (
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={resetting}
              className="border-red-900 text-red-400 hover:text-red-300 hover:bg-red-950/40"
            >
              {resetting ? <Loader2 className="size-4 animate-spin mr-2" /> : <RotateCcw className="size-4 mr-2" />}
              Reset Configuration
            </Button>
          )}
        </div>
      </div>

      {/* Setup Instructions Sidebar */}
      <div>
        <Card className="bg-slate-900 border-slate-700 ring-0 ring-transparent">
          <CardHeader>
            <CardTitle className="text-white text-base">Setup Instructions</CardTitle>
            <CardDescription className="text-slate-400">
              Follow these steps to connect Meta Lead Ads.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion className="w-full">
              <AccordionItem className="border-slate-700" value="step-1">
                <AccordionTrigger className="text-slate-300 hover:text-white hover:no-underline text-sm">
                  1. Create a Meta App
                </AccordionTrigger>
                <AccordionContent className="text-slate-400 text-sm">
                  Go to developers.facebook.com, create a Business app. Copy the App ID and App Secret into the form here.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="border-slate-700" value="step-2">
                <AccordionTrigger className="text-slate-300 hover:text-white hover:no-underline text-sm">
                  2. Add Webhooks Product
                </AccordionTrigger>
                <AccordionContent className="text-slate-400 text-sm">
                  Add the Webhooks product to your app. Select &quot;Page&quot; from the dropdown and click Subscribe to this Object.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="border-slate-700" value="step-3">
                <AccordionTrigger className="text-slate-300 hover:text-white hover:no-underline text-sm">
                  3. Configure Webhook URL
                </AccordionTrigger>
                <AccordionContent className="text-slate-400 text-sm">
                  Paste the Webhook Callback URL from this page, and the custom Verify Token you set. 
                  Once subscribed, find the &quot;leadgen&quot; field and click Subscribe.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="border-slate-700" value="step-4">
                <AccordionTrigger className="text-slate-300 hover:text-white hover:no-underline text-sm">
                  4. Get Page Access Token
                </AccordionTrigger>
                <AccordionContent className="text-slate-400 text-sm">
                  You need a System User Access Token with `leads_retrieval` and `pages_manage_ads` permissions. 
                  Generate this in Business Manager and paste it here, along with the Page ID.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
