/**
 * Map an Instagram Direct message onto the shape the shared
 * `messages` table expects.
 *
 * Instagram's Messaging webhook payload is Messenger Platform's
 * format, not WhatsApp's: text lives at `message.text`, media at
 * `message.attachments[]` (each with a `type` and a `payload.url`
 * Meta already hosts — unlike WhatsApp there is no media id to
 * re-verify or a proxy download step; the URL is directly usable).
 *
 * Kept deliberately narrower than WhatsApp's `parseMessageContent`:
 * this is the v1 surface (text + the four attachment types Meta
 * actually sends for DMs). Reactions, story replies and shares
 * degrade to a readable placeholder rather than being modeled —
 * see CLAUDE.md for what's intentionally out of scope.
 */

export interface InstagramAttachment {
  type: string
  payload?: { url?: string }
}

export interface InstagramMessage {
  mid: string
  text?: string
  attachments?: InstagramAttachment[]
  /** Present when the customer reacts to one of our messages. */
  reactions?: Array<{ reaction: string; emoji?: string }>
  is_deleted?: boolean
}

const ATTACHMENT_TO_CONTENT_TYPE: Record<string, string> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  file: 'document',
  story_mention: 'image',
  share: 'text',
}

export interface ParsedInstagramContent {
  contentType: string
  contentText: string | null
  mediaUrl: string | null
}

export function parseInstagramMessage(
  message: InstagramMessage,
): ParsedInstagramContent {
  if (message.is_deleted) {
    return { contentType: 'text', contentText: '[Message deleted]', mediaUrl: null }
  }

  if (message.text) {
    return { contentType: 'text', contentText: message.text, mediaUrl: null }
  }

  const attachment = message.attachments?.[0]
  if (attachment?.payload?.url) {
    const contentType = ATTACHMENT_TO_CONTENT_TYPE[attachment.type] ?? 'text'
    return {
      contentType,
      // Meta hosts the media directly — no caption is ever attached
      // to an Instagram attachment the way WhatsApp attaches one, so
      // there's nothing to put in contentText for a pure-media DM.
      contentText: contentType === 'text' ? '[Shared post]' : null,
      mediaUrl: attachment.payload.url,
    }
  }

  return { contentType: 'text', contentText: '[Unsupported message]', mediaUrl: null }
}
