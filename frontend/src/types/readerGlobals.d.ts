export {};

declare global {
  interface Window {
    // ReaderContainer glue
    __toggleReaderNavigation?: () => void;
    __readerCheckAndHideUI?: () => boolean;

    // Navigation / progress
    __readerGoToPosition?: (position: any) => Promise<boolean> | boolean;
    __readerGoToProgress?: (progress: number) => Promise<boolean> | boolean;
    __readerPageTurn?: (direction: 'prev' | 'next') => void;
    __saveCurrentProgress?: () => void;
    __savePreviousPosition?: (position: any) => void;

    // Bottom nav / safe-area recalculation hooks
    __onBottomNavStateChange?: () => void;

    // Text selection / EPUB helpers
    __epubClearSelection?: () => void;
    __epubHighlight?: (cfiRange: string, color?: string) => void;
    __epubUnhighlight?: (cfiRange: string) => void;
    __epubGoToChapter?: (href: string) => void;
    __lastEpubSelectionTime?: number;

    // TTS
    __onTTSStart?: () => void;
    __onTTSStop?: () => void;
    __onTTSStateChange?: () => void;
    __getTTSIsPlaying?: () => boolean;
    __getTTSCurrentIndex?: () => number;
    __getTTSTotalParagraphs?: () => number;
    __stopPageTTS?: () => void;
    __startPageTTS?: () => void;
    __stopAllTTS?: () => void;
    __prevParagraph?: () => void;
    __nextParagraph?: () => void;
    __updateTTSPlaybackSpeed?: (speed: number) => void;

    // PDF / TXT / Office helpers
    __pdfGoToPage?: (page: number) => void;
    __pdfHandleTOCClick?: (href: string) => void;
    __txtGoToPage?: (page: number) => void;
    __officeGoToProgress?: (progress: number) => void;
    __officeGoToPage?: (page: number) => void;

    // Bookmarks mode (used by readers to decide whether to persist progress)
    __isBookmarkBrowsingMode?: boolean;
    __previousPositionForSave?: any;

    // Notes marker refresh
    __updateBookNotes?: (notes: any[]) => void;
  }
}

