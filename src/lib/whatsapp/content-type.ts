/**
 * Map a WhatsApp message `type` onto the `messages.content_type`
 * CHECK constraint.
 *
 * The constraint (001, widened in 010 to add 'interactive') allows:
 *   text, image, document, audio, video, location, template, interactive
 *
 * WhatsApp sends more types than that — stickers, reactions, contacts
 * cards, system notices — and an unmapped value fails the INSERT with
 * a constraint error, which in the webhook means a silently dropped
 * message. Everything unknown therefore degrades to 'text' rather
 * than blowing up.
 *
 * Shared by the live inbound path (/api/whatsapp/webhook) and the
 * coexistence echo/history importers so a message looks identical in
 * the inbox no matter which door it came through.
 */

const ALLOWED_CONTENT_TYPES = new Set([
  'text',
  'image',
  'document',
  'audio',
  'video',
  'location',
  'template',
  'interactive',
])

export function toMessageContentType(metaType: string): string {
  if (ALLOWED_CONTENT_TYPES.has(metaType)) return metaType
  // Stickers are images that happen to loop; the inbox renders them
  // with the image bubble.
  if (metaType === 'sticker') return 'image'
  return 'text'
}
