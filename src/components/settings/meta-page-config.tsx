'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SettingsPanelHead } from './settings-panel-head';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import type { MetaPageConfig } from '@/types';

const MASKED_TOKEN = '••••••••••••••••';

type ConnectionStatus = 'connected' | 'disconnected' | 'unknown';
type ResetReason = 'token_corrupted' | 'meta_api_error' | null;

/**
 * Settings screen for `meta_page_config` — the shared row that powers
 * both the Instagram Direct webhook and the Lead Ads webhook. Cloned
 * from `whatsapp-config.tsx`: same load/save/test/reset shape, same
 * "verify with Meta before saving" contract on the API side. The one
 * structural difference is there's a single verify token and two
 * webhook URLs to copy, since one Page config drives both products.
 */
export function MetaPageConfigPanel() {
  const supabase = createClient();
  const { user, accountId, loading: authLoading, profileLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [config, setConfig] = useState<MetaPageConfig | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('unknown');
  const [resetReason, setResetReason] = useState<ResetReason>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [pageName, setPageName] = useState<string | null>(null);
  // Same re-hydration guard as whatsapp-config.tsx — see that file's
  // comment. Prevents an unrelated auth refresh from overwriting
  // in-progress, unsaved form edits.
  const loadedAccountIdRef = useRef<string | null>(null);

  const [pageId, setPageId] = useState('');
  const [igUserId, setIgUserId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [tokenEdited, setTokenEdited] = useState(false);
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');

  const instagramWebhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/instagram/webhook`
      : '';
  const leadAdsWebhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/lead-ads/webhook`
      : '';

  const fetchConfig = useCallback(async (acctId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('meta_page_config')
        .select('*')
        .eq('account_id', acctId)
        .maybeSingle();

      if (error) {
        console.error('Failed to load config row:', error);
      }

      if (data) {
        setConfig(data);
        setPageId(data.page_id || '');
        setIgUserId(data.ig_user_id || '');
        setAccessToken(MASKED_TOKEN);
        setVerifyToken('');
        setTokenEdited(false);
        setAppId(data.app_id || '');
        setAppSecret('');
      } else {
        setConfig(null);
        setPageId('');
        setIgUserId('');
        setAccessToken('');
        setVerifyToken('');
        setTokenEdited(false);
        setAppId('');
        setAppSecret('');
      }

      if (data) {
        try {
          const res = await fetch('/api/meta/config', { method: 'GET' });
          const payload = await res.json();

          if (payload.connected) {
            setConnectionStatus('connected');
            setResetReason(null);
            setStatusMessage('');
            setPageName(payload.page_info?.name ?? null);
          } else {
            setConnectionStatus('disconnected');
            setResetReason(payload.needs_reset ? 'token_corrupted' : payload.reason === 'meta_api_error' ? 'meta_api_error' : null);
            setStatusMessage(payload.message || '');
          }
        } catch (err) {
          console.error('Health check failed:', err);
          setConnectionStatus('disconnected');
        }
      } else {
        setConnectionStatus('disconnected');
        setResetReason(null);
        setStatusMessage('');
        setPageName(null);
      }
    } catch (err) {
      console.error('fetchConfig error:', err);
      toast.error('Failed to load Instagram / Lead Ads configuration');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user || !accountId) {
      loadedAccountIdRef.current = null;
      setLoading(false);
      return;
    }
    if (loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    fetchConfig(accountId);
  }, [authLoading, profileLoading, user?.id, accountId, fetchConfig]);

  async function handleSave() {
    if (!pageId.trim()) {
      toast.error('Page ID is required');
      return;
    }
    if (!config && (!accessToken.trim() || !tokenEdited)) {
      toast.error('Page Access Token is required for initial setup');
      return;
    }

    try {
      setSaving(true);

      const payload: Record<string, unknown> = {
        page_id: pageId.trim(),
        ig_user_id: igUserId.trim() || null,
        verify_token: verifyToken.trim() || null,
        app_id: appId.trim() || null,
        app_secret: appSecret.trim() || null,
      };

      if (tokenEdited && accessToken !== MASKED_TOKEN && accessToken.trim()) {
        payload.access_token = accessToken.trim();
      } else if (config) {
        toast.error('Please re-enter the Page Access Token to save changes');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/meta/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to save configuration');
        setSaving(false);
        return;
      }

      toast.success(
        data.page_info?.name
          ? `Connected — ${data.page_info.name}`
          : 'Page connected. Finish by pointing each webhook at the URLs below in the Meta App Dashboard.',
      );

      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    try {
      setTesting(true);
      const res = await fetch('/api/meta/config', { method: 'GET' });
      const payload = await res.json();

      if (payload.connected) {
        setConnectionStatus('connected');
        setResetReason(null);
        setStatusMessage('');
        setPageName(payload.page_info?.name ?? null);
        toast.success(
          payload.page_info?.name
            ? `Connected to ${payload.page_info.name}`
            : 'API connection successful'
        );
      } else {
        setConnectionStatus('disconnected');
        setResetReason(payload.needs_reset ? 'token_corrupted' : payload.reason === 'meta_api_error' ? 'meta_api_error' : null);
        setStatusMessage(payload.message || '');
        toast.error(payload.message || 'API connection failed');
      }
    } catch (err) {
      console.error('Test connection error:', err);
      setConnectionStatus('disconnected');
      toast.error('Connection test failed. Check network and try again.');
    } finally {
      setTesting(false);
    }
  }

  async function handleReset() {
    if (!confirm('This will delete the current Instagram / Lead Ads config so you can re-enter it. Continue?')) {
      return;
    }

    try {
      setResetting(true);
      const res = await fetch('/api/meta/config', { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to reset configuration');
        return;
      }

      toast.success('Configuration cleared. You can now re-enter your credentials.');
      setConfig(null);
      setPageId('');
      setIgUserId('');
      setAccessToken('');
      setVerifyToken('');
      setTokenEdited(false);
      setAppId('');
      setAppSecret('');
      setConnectionStatus('disconnected');
      setResetReason(null);
      setStatusMessage('');
      setPageName(null);
    } catch (err) {
      console.error('Reset error:', err);
      toast.error('Failed to reset configuration');
    } finally {
      setResetting(false);
    }
  }

  function handleCopy(value: string, label: string) {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copied to clipboard`);
  }

  if (loading) {
    return (
      <section className="animate-in fade-in-50 duration-200">
        <SettingsPanelHead
          title="Instagram & Lead Ads connection"
          description="Connect your Meta Page for Instagram Direct messages and Lead Ads form submissions. Credentials, webhooks, and setup steps all live here."
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  const showResetBanner = resetReason === 'token_corrupted';

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Instagram & Lead Ads connection"
        description="Connect your Meta Page for Instagram Direct messages and Lead Ads form submissions. Credentials, webhooks, and setup steps all live here."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      {/* Main config form */}
      <div className="space-y-6">
        {/* Corrupted-token reset banner */}
        {showResetBanner && (
          <Alert className="bg-amber-950/40 border-amber-600/40">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <AlertTitle className="text-amber-200 mb-1">
                  Stored token can&apos;t be decrypted
                </AlertTitle>
                <AlertDescription className="text-amber-100/80 text-sm">
                  {statusMessage}
                </AlertDescription>
                <Button
                  onClick={handleReset}
                  disabled={resetting}
                  size="sm"
                  className="mt-3 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {resetting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="size-4" />
                      Reset Configuration
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Alert>
        )}

        {/* Connection Status */}
        <Alert className="bg-card border-border">
          <div className="flex items-center gap-2">
            {connectionStatus === 'connected' ? (
              <CheckCircle2 className="size-4 text-primary" />
            ) : (
              <XCircle className="size-4 text-red-500" />
            )}
            <AlertTitle className="text-foreground mb-0">
              {connectionStatus === 'connected'
                ? pageName
                  ? `Connected — ${pageName}`
                  : 'Credentials valid'
                : 'Not Connected'}
            </AlertTitle>
          </div>
          <AlertDescription className="text-muted-foreground">
            {connectionStatus === 'connected'
              ? 'Your Page Access Token authenticates with Meta. Make sure both webhooks below are configured and subscribed in the Meta App Dashboard — this screen does not do that part automatically.'
              : statusMessage ||
                'Configure your Meta Page credentials below to connect Instagram Direct and Lead Ads.'}
          </AlertDescription>
        </Alert>

        {/* API Credentials */}
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">API Credentials</CardTitle>
            <CardDescription className="text-muted-foreground">
              Enter the Facebook Page credentials from Meta Business Suite / developers.facebook.com.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Page ID</Label>
              <Input
                placeholder="e.g. 100234567890123"
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">
                Instagram Business Account ID{' '}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                placeholder="e.g. 178414123456789"
                value={igUserId}
                onChange={(e) => setIgUserId(e.target.value)}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank if this Page runs Lead Ads only, with no Instagram account linked.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Page Access Token</Label>
              <div className="relative">
                <Input
                  type={showToken ? 'text' : 'password'}
                  placeholder="Enter your Page access token"
                  value={accessToken}
                  onChange={(e) => {
                    setAccessToken(e.target.value);
                    setTokenEdited(true);
                  }}
                  onFocus={() => {
                    if (accessToken === MASKED_TOKEN) {
                      setAccessToken('');
                      setTokenEdited(true);
                    }
                  }}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {config && !tokenEdited && (
                <p className="text-xs text-muted-foreground">
                  Token is hidden for security. Re-enter it to update configuration.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Webhook Verify Token</Label>
              <Input
                placeholder="Create a custom verify token"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">
                A custom string you create. One token covers both webhooks below — use the
                same value in both places in Meta&apos;s dashboard.
              </p>
            </div>

            {/*
              Own Meta app. Same per-account-app-secret pattern as
              whatsapp_config (migration 035): leave blank to verify
              against the operator-wide META_APP_SECRET.
            */}
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div>
                <Label className="text-foreground">
                  Own Meta app{' '}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Fill these in when this Page is reached through its own Meta app instead
                  of the operator&apos;s shared one. Point that app&apos;s webhooks at the
                  URLs below. Leave blank to keep using the app configured for the whole
                  install.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">App ID</Label>
                <Input
                  placeholder="e.g. 2499395287254373"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">App Secret</Label>
                <Input
                  type="password"
                  placeholder="Meta → App Settings → Basic → App Secret"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Stored encrypted. It&apos;s what proves an incoming webhook really came
                  from Meta, so treat it like the access token.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Webhook URLs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Webhook Configuration</CardTitle>
            <CardDescription className="text-muted-foreground">
              Copy these into the Meta App Dashboard yourself — this screen centralizes
              credential storage but does not call the Meta API on your behalf (no Tech
              Provider / Embedded Signup access yet).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Instagram webhook callback URL</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={instagramWebhookUrl}
                  className="bg-muted border-border text-muted-foreground font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleCopy(instagramWebhookUrl, 'Instagram webhook URL')}
                  className="shrink-0 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                In the app dashboard: Instagram &gt; Configuration &gt; Webhooks. Subscribe
                to the <code className="text-foreground">messages</code> field.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Lead Ads webhook callback URL</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={leadAdsWebhookUrl}
                  className="bg-muted border-border text-muted-foreground font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleCopy(leadAdsWebhookUrl, 'Lead Ads webhook URL')}
                  className="shrink-0 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                In the app dashboard: Webhooks &gt; Page, subscribed to your Page. Subscribe
                to the <code className="text-foreground">leadgen</code> field.
              </p>
            </div>

            {verifyToken.trim() && (
              <p className="text-xs text-muted-foreground">
                Use the Verify Token you entered above (
                <code className="text-foreground">{verifyToken.trim()}</code>) for both
                webhooks when Meta asks for one during the handshake.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Configuration'
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={testing || !config}
            className="border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            {testing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <Zap className="size-4" />
                Test API Connection
              </>
            )}
          </Button>
          {config && (
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={resetting}
              className="border-red-900 text-red-400 hover:text-red-300 hover:bg-red-950/40"
            >
              {resetting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <RotateCcw className="size-4" />
                  Reset Configuration
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Setup Instructions Sidebar */}
      <div>
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground text-base">Setup Instructions</CardTitle>
            <CardDescription className="text-muted-foreground">
              Follow these steps to connect Instagram Direct and/or Lead Ads.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion>
              <AccordionItem className="border-border">
                <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                    Get your Page credentials
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Go to <span className="text-primary">developers.facebook.com</span> &gt; your app</li>
                    <li>Copy the <strong className="text-foreground">Page ID</strong> from Meta Business Suite &gt; Settings</li>
                    <li>If Instagram is linked, copy the <strong className="text-foreground">Instagram Business Account ID</strong> too</li>
                    <li>Generate a <strong className="text-foreground">Page Access Token</strong> from Graph API Explorer or a System User</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="border-border">
                <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
                    Save credentials here
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Fill in the form and pick a Verify Token</li>
                    <li>Click Save Configuration — this verifies the token with Meta first</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="border-border">
                <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
                    Configure webhooks in Meta
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Paste each Webhook Callback URL above into its matching product in the Meta App Dashboard</li>
                    <li>Enter the same Verify Token you set here</li>
                    <li>Subscribe to <code className="text-foreground">messages</code> (Instagram) and/or <code className="text-foreground">leadgen</code> (Page)</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="mt-4 pt-4 border-t border-border space-y-1.5">
              <a
                href="https://developers.facebook.com/docs/messenger-platform/instagram"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
              >
                <ExternalLink className="size-3.5" />
                Instagram Messaging API Documentation
              </a>
              <a
                href="https://developers.facebook.com/docs/marketing-api/guides/lead-ads"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
              >
                <ExternalLink className="size-3.5" />
                Lead Ads Documentation
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    </section>
  );
}
