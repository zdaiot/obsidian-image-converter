// LinkFormatSettings.ts

export type LinkFormat = "wikilink" | "markdown";
export type PathFormat = "shortest" | "relative" | "absolute";

export interface LinkFormatPreset {
    name: string;
    linkFormat: LinkFormat;
    pathFormat: PathFormat;
    prependCurrentDir: boolean;
    hideFolders: boolean;
    hideAltText: boolean; // 是否隐藏 Markdown 链接中的 alt 文本
}

export class LinkFormatSettings {
    linkFormatPresets: LinkFormatPreset[];
    selectedLinkFormatPreset: string;

    constructor() {
        this.linkFormatPresets = [
            {
                name: "Default (Wikilink, Shortest)",
                linkFormat: "wikilink",
                pathFormat: "shortest",
                prependCurrentDir: false,
                hideFolders: false,
                hideAltText: true,
            },
            {
                name: "Markdown, Relative",
                linkFormat: "markdown",
                pathFormat: "relative",
                prependCurrentDir: true,
                hideFolders: false,
                hideAltText: true,
            },
            // ... more presets can be added here
        ];
        this.selectedLinkFormatPreset = "Markdown, Relative";
    }

    // Add methods to manage presets (add, delete, update) if needed
}