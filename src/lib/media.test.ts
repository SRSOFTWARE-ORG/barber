import { describe, it, expect, beforeAll } from 'vitest';
import { withImageCacheBust } from './media';

beforeAll(() => {
  // jsdom provides window.location; ensure origin exists for URL parsing
  if (!window.location.origin) {
    Object.defineProperty(window, 'location', {
      value: { origin: 'http://localhost' },
      writable: true,
    });
  }
});

describe('withImageCacheBust', () => {
  it('returns null when src is null', () => {
    expect(withImageCacheBust(null)).toBeNull();
  });

  it('leaves data: URLs untouched (no ?t= appended)', () => {
    const dataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const result = withImageCacheBust(dataUrl, 1234);
    expect(result).toBe(dataUrl);
    expect(result).not.toContain('?t=');
    expect(result).not.toContain('&t=');
  });

  it('leaves blob: URLs untouched', () => {
    const blobUrl = 'blob:http://localhost/abc-123';
    const result = withImageCacheBust(blobUrl, 1234);
    expect(result).toBe(blobUrl);
    expect(result).not.toContain('t=1234');
  });

  it('appends ?t= to an absolute http URL', () => {
    const result = withImageCacheBust('https://cdn.example.com/a.jpg', 42);
    expect(result).toBe('https://cdn.example.com/a.jpg?t=42');
  });

  it('replaces an existing ?t= parameter on the same URL', () => {
    const first = withImageCacheBust('https://cdn.example.com/a.jpg', 1);
    const second = withImageCacheBust(first as string, 2);
    expect(second).toBe('https://cdn.example.com/a.jpg?t=2');
  });

  it('preserves other query parameters when adding ?t=', () => {
    const result = withImageCacheBust('https://cdn.example.com/a.jpg?w=100', 7);
    expect(result).toContain('w=100');
    expect(result).toContain('t=7');
  });

  it('handles relative URLs by resolving against window origin', () => {
    const result = withImageCacheBust('/avatars/me.jpg', 9);
    expect(result).toContain('/avatars/me.jpg');
    expect(result).toContain('t=9');
  });
});
