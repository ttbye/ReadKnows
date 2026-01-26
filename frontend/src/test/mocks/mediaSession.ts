/**
 * @file mediaSession.ts
 * @description Media Session API Mock
 */

import { vi } from 'vitest';

/**
 * 创建模拟的 Media Session API
 */
export function createMockMediaSession() {
  const metadata = {
    title: '',
    artist: '',
    album: '',
    artwork: [] as MediaImage[],
  };
  
  const playbackState: MediaSessionPlaybackState = 'none';
  const actionHandlers: Record<string, (() => void) | null> = {};
  
  return {
    metadata,
    playbackState,
    setActionHandler: vi.fn((action: string, handler: (() => void) | null) => {
      actionHandlers[action] = handler;
    }),
    getActionHandler: (action: string) => actionHandlers[action],
    triggerAction: (action: string) => {
      const handler = actionHandlers[action];
      if (handler) {
        handler();
      }
    },
  };
}

/**
 * Mock navigator.mediaSession
 */
export function mockNavigatorMediaSession() {
  const mockMediaSession = createMockMediaSession();
  
  Object.defineProperty(navigator, 'mediaSession', {
    writable: true,
    value: mockMediaSession,
  });
  
  return mockMediaSession;
}

/**
 * Mock window.MediaMetadata
 */
export function mockMediaMetadata() {
  const MediaMetadataMock = vi.fn().mockImplementation((init?: MediaMetadataInit) => {
    return {
      title: init?.title || '',
      artist: init?.artist || '',
      album: init?.album || '',
      artwork: init?.artwork || [],
    };
  });
  
  Object.defineProperty(window, 'MediaMetadata', {
    writable: true,
    value: MediaMetadataMock,
  });
  
  return MediaMetadataMock;
}
