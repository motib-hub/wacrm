"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Link2, Loader2, Plus, Trash2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SettingsPanelHead } from "./settings-panel-head";
import type { LeadSource } from "@/types";

/** Where the viewer's own WhatsApp number is remembered between visits. */
const NUMBER_KEY = "wacrm.lead-sources.number";

/**
 * Lead sources — the origin of everyone who does NOT arrive from an ad.
 *
 * Meta names the ad a Click-to-WhatsApp lead came from. Every other
 * channel arrives anonymous: WhatsApp passes a phone number and a
 * message, and UTMs die at the jump out of the browser. The one thing
 * that survives is the prefilled text, so each placement gets its own
 * sentence and the CRM reads it back on the first message.
 *
 * This panel is where those sentences are registered and where the
 * ready-made link for each one is copied.
 */
export function LeadSourcesPanel() {
  const supabase = createClient();
  const { accountId, user, canEditSettings, profileLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");
  const [matchText, setMatchText] = useState("");
  const [phone, setPhone] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    try {
      setPhone(window.localStorage.getItem(NUMBER_KEY) ?? "");
    } catch {
      // Private windows and blocked site data throw on access. The
      // panel works without a remembered number; the field just starts
      // empty.
    }
  }, []);

  useEffect(() => {
    if (profileLoading) return;
    if (!accountId) {
      setLoading(false);
      return;
    }
    void fetchSources(accountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileLoading, accountId]);

  async function fetchSources(account: string) {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("lead_sources")
        .select("*")
        .eq("account_id", account)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setSources(data ?? []);
    } catch (err) {
      console.error("Failed to load lead sources:", err);
      toast.error("Couldn't load your sources");
    } finally {
      setLoading(false);
    }
  }

  function rememberPhone(value: string) {
    setPhone(value);
    try {
      window.localStorage.setItem(NUMBER_KEY, value);
    } catch {
      // Same as above — losing the convenience is fine, throwing is not.
    }
  }

  async function handleCreate() {
    if (!accountId) return;
    if (!label.trim() || !matchText.trim()) {
      toast.error("Both the name and the sentence are required");
      return;
    }

    const code = slugify(label);
    if (!code) {
      toast.error("Give it a name with at least one letter or number");
      return;
    }

    try {
      setSaving(true);
      const { data, error } = await supabase
        .from("lead_sources")
        .insert({
          account_id: accountId,
          created_by: user?.id ?? null,
          code,
          label: label.trim(),
          match_text: matchText.trim(),
        })
        .select()
        .single();

      // 23505: the account already has a source with this code. Renaming
      // the label is the fix, and saying so beats a Postgres error string.
      if (error?.code === "23505") {
        toast.error("You already have a source with that name");
        return;
      }
      if (error) throw error;

      setSources((prev) => [...prev, data as LeadSource]);
      setLabel("");
      setMatchText("");
      toast.success("Source created");
    } catch (err) {
      console.error("Failed to create lead source:", err);
      toast.error("Couldn't create the source");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(source: LeadSource) {
    try {
      const { error } = await supabase
        .from("lead_sources")
        .delete()
        .eq("id", source.id);
      if (error) throw error;
      setSources((prev) => prev.filter((s) => s.id !== source.id));
      // Contacts already attributed keep their origin: it is stamped on
      // the contact row, not read through this table.
      toast.success("Source removed");
    } catch (err) {
      console.error("Failed to delete lead source:", err);
      toast.error("Couldn't remove the source");
    }
  }

  async function copyLink(source: LeadSource) {
    const link = buildLink(phone, source.match_text);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(source.id);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Couldn't copy — select the link and copy it by hand");
    }
  }

  if (loading || profileLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <SettingsPanelHead
        title="Lead sources"
        description="Meta tells you which ad a lead came from. Nothing else does — a website button, a QR in the shop, the link in your bio all arrive anonymous. Give each placement its own opening sentence and the CRM records where the person came from."
      />

      <Card className="mb-5 border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base text-foreground">
            Your WhatsApp number
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Used to build the links below. Digits only, with country code —
            e.g. 34674066429. Stored in this browser, not in the account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={phone}
            onChange={(e) => rememberPhone(e.target.value.replace(/\D/g, ""))}
            placeholder="34674066429"
            inputMode="numeric"
            className="max-w-xs border-border bg-muted text-foreground"
          />
        </CardContent>
      </Card>

      {canEditSettings && (
        <Card className="mb-5 border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base text-foreground">
              New source
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Write the sentence the way a person would — they can see it, and
              a code they don&apos;t understand is a code they delete.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ls-label" className="text-muted-foreground">
                Name
              </Label>
              <Input
                id="ls-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Website button"
                className="border-border bg-muted text-foreground"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ls-text" className="text-muted-foreground">
                Opening sentence
              </Label>
              <Input
                id="ls-text"
                value={matchText}
                onChange={(e) => setMatchText(e.target.value)}
                placeholder="Hola, vengo de la web"
                className="border-border bg-muted text-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Matched ignoring accents, case and punctuation, and it still
                counts when the person keeps typing after it.
              </p>
            </div>
            <Button
              onClick={handleCreate}
              disabled={saving}
              className="self-start bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Add source
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base text-foreground">
            Registered sources
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sources.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No sources yet. Everyone who isn&apos;t coming from an ad will
              show up without an origin.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {sources.map((source) => (
                <li
                  key={source.id}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {source.label}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        &ldquo;{source.match_text}&rdquo;
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {source.code}
                      </span>
                      {canEditSettings && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(source)}
                          aria-label={`Remove ${source.label}`}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-md bg-background px-2 py-1.5 text-xs text-muted-foreground">
                      {phone ? buildLink(phone, source.match_text) : "Add your number above to build the link"}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!phone}
                      onClick={() => copyLink(source)}
                      className="shrink-0 border-border"
                    >
                      {copied === source.id ? (
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {copied === source.id ? "Copied" : "Copy link"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-5 flex items-start gap-2 text-xs text-muted-foreground">
            <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              People can edit the sentence before sending, so these counts are a
              floor rather than a census. A lead who arrives from a Meta ad
              keeps the ad as their origin — that evidence comes from the
              platform and outranks this.
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Reporting key derived from the label, so nobody has to invent one.
 * Accents are folded rather than dropped: "Botón de la web" must not
 * become "bot-n-de-la-web".
 */
function slugify(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * `wa.me` rather than `api.whatsapp.com`: it is the short form Meta
 * documents for sharing, and it opens the app on mobile and Web
 * WhatsApp on desktop without a redirect.
 */
function buildLink(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
