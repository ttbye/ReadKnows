/**
 * @file downloadFonts.ts
 * @author ttbye
 * @date 2025-12-11
 */
declare const fontsToDownload: {
    name: string;
    fileName: string;
    url: string;
    type: string;
    isZip: boolean;
}[];
export declare function downloadAndInstallFont(fontConfig: typeof fontsToDownload[0]): Promise<void>;
export declare function downloadAllFonts(): Promise<void>;
export {};
//# sourceMappingURL=downloadFonts.d.ts.map