import { describe, expect, it } from 'vitest';
import { applyBrandToMessages } from './brand-messages';

const brand = { name: 'MOTIB CRM', description: 'Brand description' };

describe('applyBrandToMessages', () => {
  const messages = {
    Sidebar: { title: 'CRM Template for WhatsApp', inbox: 'Inbox' },
    Auth: { desc: 'Get started with CRM Template for WhatsApp' },
    Api: { join: 'Join {accountName} on wacrm using this link: {url}' },
    Metadata: { description: 'Self-hostable CRM template for WhatsApp.' },
    Other: { words: ['wacrm', 'wacrmish stays'] },
  };

  it('replaces the literal upstream name and the localized product title', () => {
    const out = applyBrandToMessages(messages, brand);
    expect(out.Sidebar.title).toBe('MOTIB CRM');
    expect(out.Auth.desc).toBe('Get started with MOTIB CRM');
    expect(out.Api.join).toBe('Join {accountName} on MOTIB CRM using this link: {url}');
    expect(out.Other.words).toEqual(['MOTIB CRM', 'wacrmish stays']);
  });

  it('uses the brand description for metadata and leaves other copy alone', () => {
    const out = applyBrandToMessages(messages, brand);
    expect(out.Metadata.description).toBe('Brand description');
    expect(out.Sidebar.inbox).toBe('Inbox');
  });

  it('does not mutate the source catalogue', () => {
    applyBrandToMessages(messages, brand);
    expect(messages.Sidebar.title).toBe('CRM Template for WhatsApp');
  });
});
