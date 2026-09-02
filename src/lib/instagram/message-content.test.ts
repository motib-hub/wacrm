import { describe, expect, it } from 'vitest'

import { parseInstagramMessage } from './message-content'

describe('parseInstagramMessage', () => {
  it('parses plain text', () => {
    expect(parseInstagramMessage({ mid: 'm1', text: 'Hola, quiero info' })).toEqual({
      contentType: 'text',
      contentText: 'Hola, quiero info',
      mediaUrl: null,
    })
  })

  it('parses an image attachment', () => {
    const result = parseInstagramMessage({
      mid: 'm2',
      attachments: [{ type: 'image', payload: { url: 'https://cdn.example/img.jpg' } }],
    })
    expect(result).toEqual({
      contentType: 'image',
      contentText: null,
      mediaUrl: 'https://cdn.example/img.jpg',
    })
  })

  it.each([
    ['video', 'video'],
    ['audio', 'audio'],
    ['file', 'document'],
  ])('maps attachment type %s to content_type %s', (metaType, expected) => {
    const result = parseInstagramMessage({
      mid: 'm3',
      attachments: [{ type: metaType, payload: { url: 'https://cdn.example/f' } }],
    })
    expect(result.contentType).toBe(expected)
  })

  it('degrades a deleted message to a readable placeholder', () => {
    expect(parseInstagramMessage({ mid: 'm4', is_deleted: true })).toEqual({
      contentType: 'text',
      contentText: '[Message deleted]',
      mediaUrl: null,
    })
  })

  it('degrades a share attachment to text (no media url to store)', () => {
    const result = parseInstagramMessage({
      mid: 'm5',
      attachments: [{ type: 'share', payload: { url: 'https://instagram.com/p/xyz' } }],
    })
    expect(result.contentType).toBe('text')
    expect(result.mediaUrl).toBe('https://instagram.com/p/xyz')
  })

  it('falls back to an unsupported-message placeholder when there is nothing usable', () => {
    expect(parseInstagramMessage({ mid: 'm6' })).toEqual({
      contentType: 'text',
      contentText: '[Unsupported message]',
      mediaUrl: null,
    })
  })

  it('prefers text over attachments when both are somehow present', () => {
    const result = parseInstagramMessage({
      mid: 'm7',
      text: 'mira esto',
      attachments: [{ type: 'image', payload: { url: 'https://cdn.example/img.jpg' } }],
    })
    expect(result.contentType).toBe('text')
    expect(result.contentText).toBe('mira esto')
  })
})
