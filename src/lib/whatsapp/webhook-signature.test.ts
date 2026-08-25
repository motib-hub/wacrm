import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyMetaWebhookSignature } from "./webhook-signature";

const SECRET = process.env.META_APP_SECRET!;

function signedHeader(body: string, secret: string = SECRET): string {
  const hex = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${hex}`;
}

describe("verifyMetaWebhookSignature", () => {
  it("accepts a request signed with the correct secret", () => {
    const body = JSON.stringify({ object: "whatsapp_business_account" });
    expect(verifyMetaWebhookSignature(body, signedHeader(body))).toBe(true);
  });

  it("rejects a signature computed with a different secret", () => {
    const body = "{}";
    expect(verifyMetaWebhookSignature(body, signedHeader(body, "wrong"))).toBe(
      false,
    );
  });

  it("rejects when the body has been tampered with after signing", () => {
    const original = '{"entry":[]}';
    const header = signedHeader(original);
    const tampered = '{"entry":[{"id":"injected"}]}';
    expect(verifyMetaWebhookSignature(tampered, header)).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(verifyMetaWebhookSignature("anything", null)).toBe(false);
  });

  it("rejects a header without the sha256= prefix", () => {
    const body = "{}";
    const hex = crypto
      .createHmac("sha256", SECRET)
      .update(body)
      .digest("hex");
    expect(verifyMetaWebhookSignature(body, hex)).toBe(false);
    expect(verifyMetaWebhookSignature(body, `sha512=${hex}`)).toBe(false);
  });

  it("rejects a header of the wrong length without throwing", () => {
    // timingSafeEqual would throw on length mismatch — the guard inside
    // the verifier should catch this and return false instead.
    expect(verifyMetaWebhookSignature("{}", "sha256=tooshort")).toBe(false);
  });

  describe("fail-closed when secret is missing", () => {
    const originalSecret = process.env.META_APP_SECRET;
    beforeEach(() => {
      delete process.env.META_APP_SECRET;
    });
    afterEach(() => {
      process.env.META_APP_SECRET = originalSecret;
    });

    it("rejects even a correctly-formed signature when no secret is configured", () => {
      const body = "{}";
      // Use the original secret to produce the header so we can verify
      // the rejection is solely due to missing config.
      const header = signedHeader(body, originalSecret!);
      expect(verifyMetaWebhookSignature(body, header)).toBe(false);
    });

    it("still accepts a payload signed by an account's own app", () => {
      // The whole point of per-account secrets: a client whose WABA
      // lives in their own portfolio brings their own Meta app, and the
      // operator-wide env var may not even exist.
      const body = "{}";
      const ownSecret = "client-owned-app-secret";
      expect(
        verifyMetaWebhookSignature(body, signedHeader(body, ownSecret), [
          ownSecret,
        ]),
      ).toBe(true);
    });
  });

  describe("per-account app secrets", () => {
    const ACCOUNT_SECRET = "account-scoped-secret";

    it("accepts a payload signed with the account's own secret", () => {
      const body = JSON.stringify({ object: "whatsapp_business_account" });
      expect(
        verifyMetaWebhookSignature(body, signedHeader(body, ACCOUNT_SECRET), [
          ACCOUNT_SECRET,
          SECRET,
        ]),
      ).toBe(true);
    });

    it("still accepts the operator-wide secret when both are offered", () => {
      // Numbers connected through our own Meta app must keep working
      // unchanged while other accounts bring their own.
      const body = JSON.stringify({ object: "whatsapp_business_account" });
      expect(
        verifyMetaWebhookSignature(body, signedHeader(body, SECRET), [
          ACCOUNT_SECRET,
          SECRET,
        ]),
      ).toBe(true);
    });

    it("rejects a secret belonging to neither", () => {
      const body = "{}";
      expect(
        verifyMetaWebhookSignature(body, signedHeader(body, "someone-else"), [
          ACCOUNT_SECRET,
          SECRET,
        ]),
      ).toBe(false);
    });

    it("ignores nullish candidates so callers need not filter", () => {
      // The account secret is null for every account that hasn't got its
      // own app, which is the common case.
      const body = "{}";
      expect(
        verifyMetaWebhookSignature(body, signedHeader(body, SECRET), [
          null,
          undefined,
          SECRET,
        ]),
      ).toBe(true);
    });

    it("falls back to the env var when the candidate list is empty", () => {
      const body = "{}";
      expect(verifyMetaWebhookSignature(body, signedHeader(body), [])).toBe(
        true,
      );
    });
  });
});
