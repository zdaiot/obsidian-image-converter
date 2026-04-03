import {
    Plugin,
    Editor,
    Platform,
    Notice,
    TFile,
    TFolder,
    EditorPosition,
    MarkdownView,
    requestUrl
} from "obsidian";
import { SupportedImageFormats } from "./SupportedImageFormats";
import { FolderAndFilenameManagement } from "./FolderAndFilenameManagement";
import { ImageProcessor } from "./ImageProcessor";
import { VariableProcessor } from "./VariableProcessor";
import { LinkFormatPreset } from "./LinkFormatSettings";
import { LinkFormatter } from "./LinkFormatter";
import { NonDestructiveResizePreset } from "./NonDestructiveResizeSettings";
import { ContextMenu, FigureReferenceSuggestModal, scanFigureIds } from "./ContextMenu";
// import { ImageAlignment } from './ImageAlignment';
import { ImageAlignmentManager } from './ImageAlignmentManager';
import { ImageResizer } from "./ImageResizer";
import { BatchImageProcessor } from "./BatchImageProcessor";
import { ProcessSingleImageModal } from "./ProcessSingleImageModal";
import { ProcessFolderModal } from "./ProcessFolderModal";
import { ProcessCurrentNote } from "./ProcessCurrentNote";
import { ProcessAllVaultModal } from "./ProcessAllVaultModal"
import { ImageCaptionManager } from "./ImageCaptionManager"

// Settings tab and all DEFAULTS
import {
    ImageConverterSettings,
    DEFAULT_SETTINGS,
    ImageConverterSettingTab,
    ConversionPreset,
    FilenamePreset,
    FolderPreset,
    ConfirmDialog
} from "./ImageConverterSettings";

import { PresetSelectionModal } from "./PresetSelectionModal";
import { initI18n, t } from "./i18n";

export default class ImageConverterPlugin extends Plugin {
    settings: ImageConverterSettings;

    // Check supported image formats
    supportedImageFormats: SupportedImageFormats;
    // Handle image management
    folderAndFilenameManagement: FolderAndFilenameManagement;
    // Handle image processing
    imageProcessor: ImageProcessor;
    // Handle variable processing
    variableProcessor: VariableProcessor;
    // linkFormatSettings: LinkFormatSettings;     // Link format - it is initialised via ImageConverterSettings
    // Link formatter
    linkFormatter: LinkFormatter;
    // Context menu
    contextMenu: ContextMenu;
    // Alignment
    // imageAlignment: ImageAlignment | null = null;
    ImageAlignmentManager: ImageAlignmentManager | null = null;
    // drag-resize
    imageResizer: ImageResizer | null = null;
    // batch processing
    batchImageProcessor: BatchImageProcessor;
    // Single Image Modal
    processSingleImageModal: ProcessSingleImageModal;
    // Process whole fodler
    processFolderModal: ProcessFolderModal;
    // Processcurrent note/canvas
    processCurrentNote: ProcessCurrentNote;
    // ProcessAllVault
    processAllVaultModal: ProcessAllVaultModal
    // captions
    captionManager: ImageCaptionManager;
    
    private processedImage: ArrayBuffer | null = null;
    private temporaryBuffers: (ArrayBuffer | Blob | null)[] = [];
    // 用于防止换行符规范化时的递归触发
    private isNormalizingLineEndings = false;

    async onload() {
        // 初始化国际化
        initI18n();
        
        await this.loadSettings();
        this.addSettingTab(new ImageConverterSettingTab(this.app, this));

        // Initialize core components immediately
        this.supportedImageFormats = new SupportedImageFormats(this.app);

        // Captions are time-sensitive
        if (this.settings.enableImageCaptions) {
            this.captionManager = new ImageCaptionManager(this);
            this.register(() => this.captionManager.cleanup());
        }


        // Initialize ImageAlignment early since it's time-sensitive
        if (this.settings.isImageAlignmentEnabled) {
            this.ImageAlignmentManager = new ImageAlignmentManager(
                this.app,
                this,
                this.supportedImageFormats,
            );
            await this.ImageAlignmentManager.initialize();

            // This helps when opening into note with alignments set and fires less often than e.g. active-leaf-change
            this.registerEvent(
                this.app.workspace.on('file-open', (file) => {
                    if (file) {
                        this.ImageAlignmentManager?.applyAlignmentsToNote(file.path)
                            .catch((err) => {
                                const errorMessage = err instanceof Error ? err.message : String(err);
                                console.error('Failed to apply alignments on file-open:', errorMessage);
                            });

                        if (this.settings.enableImageCaptions) {
                            this.captionManager.refresh();
                        }
                    }
                })
            );
        }

        // // REDUNDANT - Below already initializes on layout change and for applying alignemnt "file-open" is much better option as it fires much less often
        // // NOTE: For alignment to be set this must be outside `this.app.workspace.onLayoutReady(() => {`
        // // Initialize DRAG/SCROLL rESIZING and apply alignments- when opening into the note or swithing notes 
        // this.registerEvent(
        //     this.app.workspace.on('active-leaf-change', (leaf) => {
        //         console.count("active-leaf-change triggered")
        //         // const markdownView = leaf?.view instanceof MarkdownView ? leaf.view : null;
        //         // if (markdownView && this.imageResizer && this.settings.isImageResizeEnbaled) {
        //         //     this.imageResizer.onload(markdownView);
        //         // }
        //         // // Delay the execution slightly to ensure the new window's DOM is ready
        //         // setTimeout(() => {
        //         //     this.ImageAlignmentManager!.setupImageObserver();
        //         // }, 500);
        //         const currentFile = this.app.workspace.getActiveFile();
        //         if (currentFile) {
        //             // console.log("current file path:", currentFile.path)
        //             void this.ImageAlignmentManager!.applyAlignmentsToNote(currentFile.path);
        //         }
        //     })
        // );


        // 处理没有扩展名的图片文件：
        // Obsidian 会将 <img src="Agent入门/640-xxx"> 转换为 app://obsidian.md/Agent入门/640-xxx
        // 无扩展名的文件会导致 ERR_FILE_NOT_FOUND，需要通过读取文件内容创建 blob URL 来修复
        this.setupExtensionlessImageFixer();

        // 注册文件修改事件，规范化换行符
        this.setupLineEndingNormalizer();

        // Wait for layout to be ready before initializing view-dependent components
        this.app.workspace.onLayoutReady(() => {
            this.initializeComponents().catch((err) => {
                console.error('Failed to initialize components:', err);
                //eslint-disable-next-line
new Notice(t('main.notice.failedToInitialize'));
            });

            // Apply Image Alignment and Resizing when switching Live to Reading mode etc.
            if (this.settings.isImageAlignmentEnabled || this.settings.isImageResizeEnbaled) {
                this.registerEvent(
                    this.app.workspace.on('layout-change', () => {
                        if (this.settings.isImageAlignmentEnabled) {
                            const currentFile = this.app.workspace.getActiveFile();
                            if (currentFile) {
                                this.ImageAlignmentManager?.applyAlignmentsToNote(currentFile.path)
                                    .catch((err) => {
                                        const errorMessage = err instanceof Error ? err.message : String(err);
                                        console.error('Failed to apply alignments on layout-change:', errorMessage);
                                    });
                            }
                        }

                        if (this.settings.isImageResizeEnbaled) {
                            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                            if (activeView) {
                                this.imageResizer?.onLayoutChange(activeView);
                            }
                        }

                        if (this.settings.enableImageCaptions) {
                            this.captionManager.refresh();
                        }
                        
                    })
                );
            }
            
            // // Prevent link from showing up
            // const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            // if (!activeView) return;

            // this.registerDomEvent(activeView.contentEl, 'click', (evt: MouseEvent) => {
            //     const target = evt.target as HTMLElement;
            //     if (target.tagName === 'IMG') {
            //         evt.preventDefault();
            //         evt.stopPropagation();
            //     }
            // }, true);

        });
    }

    // ==========================
    // 无扩展名图片修复功能
    // ==========================

    /** 全局 MutationObserver 引用，用于在 unload 时断开 */
    private extensionlessImgObserver: MutationObserver | null = null;
    /** 已创建的 blob URL 集合，用于 unload 时统一回收 */
    private extensionlessBlobUrls: Set<string> = new Set();

    /**
     * 设置无扩展名图片修复器。
     * 使用全局 MutationObserver 监听所有 <img> 元素的添加和 src 变化，
     * 当发现 app://obsidian.md/ 路径下的无扩展名图片加载失败时，
     * 读取 vault 中的实际文件内容并替换为 blob URL。
     */
    private setupExtensionlessImageFixer(): void {
        console.debug('[Image Converter] setupExtensionlessImageFixer: initializing');

        // 处理单个 img 元素
        const handleImg = (img: HTMLImageElement) => {
            if (img.hasAttribute('data-ext-fixed')) return;
            const src = img.getAttribute('src');
            if (!src) return;

            // 只处理 app://obsidian.md/ 开头的路径（Obsidian 转换后的内部路径）
            // 以及原始相对路径（可能在 post processor 阶段还没被转换）
            const vaultRelativePath = this.extractVaultRelativePath(src);
            if (!vaultRelativePath) return;

            // 检查文件名是否缺少扩展名
            const filename = vaultRelativePath.split('/').pop() || '';
            if (!this.isLikelyExtensionlessImage(filename)) return;

            // 标记为已处理，防止重复
            img.setAttribute('data-ext-fixed', 'pending');
            console.debug('[Image Converter] handleImg: detected extensionless image, vaultPath =', vaultRelativePath);

            this.resolveAndFixImage(img, src, vaultRelativePath);
        };

        // 也通过 img.onerror 来捕获 — 当 Obsidian 尝试加载失败时触发
        const attachErrorHandler = (img: HTMLImageElement) => {
            if (img.hasAttribute('data-ext-error-attached')) return;
            img.setAttribute('data-ext-error-attached', 'true');
            img.addEventListener('error', () => {
                console.debug('[Image Converter] img.onerror fired, src =', img.getAttribute('src'));
                if (!img.hasAttribute('data-ext-fixed') || img.getAttribute('data-ext-fixed') === 'pending') {
                    handleImg(img);
                }
            }, { once: true });
        };

        // 扫描一个容器中的所有 img
        const scanContainer = (container: Element | Document) => {
            const imgs = container.querySelectorAll('img');
            for (const img of Array.from(imgs)) {
                const imgEl = img as HTMLImageElement;
                attachErrorHandler(imgEl);
                handleImg(imgEl);
            }
        };

        // 1. 注册 Markdown Post Processor（阅读模式）
        this.registerMarkdownPostProcessor((el) => {
            console.debug('[Image Converter] PostProcessor: scanning rendered block for extensionless images');
            scanContainer(el);
        });

        // 2. 全局 MutationObserver（Live Preview 和所有模式）
        this.extensionlessImgObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                // 检查新增的节点
                for (const node of Array.from(mutation.addedNodes)) {
                    if (node instanceof HTMLImageElement) {
                        attachErrorHandler(node);
                        handleImg(node);
                    } else if (node instanceof Element) {
                        scanContainer(node);
                    }
                }
                // 检查属性变化（src 被 Obsidian 修改时）
                if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                    const target = mutation.target;
                    if (target instanceof HTMLImageElement && !target.hasAttribute('data-ext-fixed')) {
                        attachErrorHandler(target);
                        handleImg(target);
                    }
                }
                // 清理被移除的节点中的 blob URL
                for (const node of Array.from(mutation.removedNodes)) {
                    if (node instanceof Element) {
                        const imgs = node.querySelectorAll('img[data-ext-fixed="done"]');
                        for (const img of Array.from(imgs)) {
                            const blobSrc = (img as HTMLImageElement).getAttribute('src');
                            if (blobSrc && blobSrc.startsWith('blob:')) {
                                URL.revokeObjectURL(blobSrc);
                                this.extensionlessBlobUrls.delete(blobSrc);
                            }
                        }
                        if (node instanceof HTMLImageElement) {
                            const blobSrc = node.getAttribute('src');
                            if (blobSrc && blobSrc.startsWith('blob:')) {
                                URL.revokeObjectURL(blobSrc);
                                this.extensionlessBlobUrls.delete(blobSrc);
                            }
                        }
                    }
                }
            }
        });

        // 在 document.body 上观察，确保能捕获所有 Obsidian 渲染的 img
        this.extensionlessImgObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src']
        });

        // 3. 确保插件卸载时清理
        this.register(() => {
            if (this.extensionlessImgObserver) {
                this.extensionlessImgObserver.disconnect();
                this.extensionlessImgObserver = null;
            }
            // 回收所有 blob URL
            for (const url of this.extensionlessBlobUrls) {
                URL.revokeObjectURL(url);
            }
            this.extensionlessBlobUrls.clear();
        });

        // 4. 对当前已存在的 img 做一次初始扫描
        setTimeout(() => {
            console.debug('[Image Converter] setupExtensionlessImageFixer: initial scan');
            scanContainer(document.body);
        }, 500);
    }

    /**
     * 从 img src 中提取 vault 相对路径。
     * 支持格式：
     *   - app://obsidian.md/Agent入门/640-xxx  → Agent入门/640-xxx
     *   - Agent入门/640-xxx                    → Agent入门/640-xxx
     * 返回 null 表示不需要处理（外部链接、data URI 等）。
     */
    private extractVaultRelativePath(src: string): string | null {
        if (!src) return null;
        // 排除不需要处理的 URI
        if (src.startsWith('data:') || src.startsWith('blob:') ||
            src.startsWith('http://') || src.startsWith('https://')) {
            return null;
        }

        let cleanSrc = decodeURIComponent(src.split('?')[0].split('#')[0]);

        // 处理 app://obsidian.md/path 格式
        if (cleanSrc.startsWith('app://')) {
            // app://obsidian.md/Agent入门/640-xxx
            // 去掉 app:// 后，第一段是 host（如 obsidian.md 或 local），后面是路径
            const withoutProtocol = cleanSrc.substring('app://'.length);
            const slashIndex = withoutProtocol.indexOf('/');
            if (slashIndex >= 0) {
                cleanSrc = withoutProtocol.substring(slashIndex + 1);
            } else {
                return null;
            }
        }

        return cleanSrc || null;
    }

    /**
     * 判断文件名是否像是一个无扩展名的图片文件。
     */
    private isLikelyExtensionlessImage(filename: string): boolean {
        if (!filename) return false;
        const dotIndex = filename.lastIndexOf('.');
        if (dotIndex <= 0) {
            // 没有扩展名，或以 . 开头（隐藏文件）
            return true;
        }
        const ext = filename.substring(dotIndex + 1).toLowerCase();
        // 已知图片扩展名 → 不需要处理
        const knownImageExtensions = new Set([
            'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico',
            'tif', 'tiff', 'heic', 'heif', 'avif', 'apng', 'jfif'
        ]);
        if (knownImageExtensions.has(ext)) return false;
        // 已知非图片扩展名 → 不处理
        const nonImageExtensions = new Set([
            'md', 'txt', 'pdf', 'html', 'css', 'js', 'ts', 'json', 'xml',
            'yaml', 'yml', 'csv', 'mp3', 'mp4', 'wav', 'avi', 'mov',
            'zip', 'rar', 'tar', 'gz', 'exe', 'dll', 'so'
        ]);
        if (nonImageExtensions.has(ext)) return false;
        // 未知扩展名 — 可能是无扩展名的图片
        return true;
    }

    /**
     * 根据 vault 相对路径找到文件，读取内容并修复 img 的 src。
     */
    private resolveAndFixImage(img: HTMLImageElement, originalSrc: string, vaultRelativePath: string): void {
        const activeFile = this.app.workspace.getActiveFile();

        // 构建多个候选路径
        const tryPaths: string[] = [];
        // 1. 直接使用 vault 相对路径
        tryPaths.push(vaultRelativePath);
        // 2. 如果当前笔记在子目录中，尝试相对于笔记目录的路径
        if (activeFile?.parent) {
            const parentPath = activeFile.parent.path;
            if (parentPath) {
                tryPaths.unshift(`${parentPath}/${vaultRelativePath}`);
            }
        }

        let foundFile: TFile | null = null;
        for (const tryPath of tryPaths) {
            const normalized = tryPath.replace(/\\/g, '/').replace(/^\//, '');
            const abstractFile = this.app.vault.getAbstractFileByPath(normalized);
            if (abstractFile instanceof TFile) {
                foundFile = abstractFile;
                break;
            }
        }

        if (!foundFile) {
            console.debug('[Image Converter] resolveAndFixImage: file NOT found. Tried:', tryPaths);
            img.setAttribute('data-ext-fixed', 'not-found');
            return;
        }

        console.debug('[Image Converter] resolveAndFixImage: found file:', foundFile.path);

        // 读取文件内容并检测 MIME 类型
        this.app.vault.readBinary(foundFile).then((buffer) => {
            const mimeType = this.detectMimeTypeFromBuffer(buffer);
            console.debug('[Image Converter] resolveAndFixImage: MIME =', mimeType, ', size =', buffer.byteLength);
            if (mimeType && mimeType !== 'unknown') {
                const blob = new Blob([buffer], { type: mimeType });
                const blobUrl = URL.createObjectURL(blob);
                this.extensionlessBlobUrls.add(blobUrl);
                img.setAttribute('src', blobUrl);
                img.setAttribute('data-original-src', originalSrc);
                img.setAttribute('data-ext-fixed', 'done');
                console.debug('[Image Converter] resolveAndFixImage: replaced src with blob URL');
            } else {
                console.debug('[Image Converter] resolveAndFixImage: unknown MIME type, skipping');
                img.setAttribute('data-ext-fixed', 'unknown-mime');
            }
        }).catch((err) => {
            console.debug('[Image Converter] resolveAndFixImage: read error:', err);
            img.setAttribute('data-ext-fixed', 'error');
        });
    }

    /**
     * 通过文件的 magic bytes 检测 MIME 类型
     */
    private detectMimeTypeFromBuffer(buffer: ArrayBuffer): string {
        const arr = new Uint8Array(buffer).subarray(0, 24);
        let headerHex = '';
        for (let i = 0; i < Math.min(arr.length, 12); i++) {
            headerHex += arr[i].toString(16).padStart(2, '0');
        }
        headerHex = headerHex.toLowerCase();

        if (headerHex.startsWith('89504e47')) return 'image/png';
        if (headerHex.startsWith('47494638')) return 'image/gif';
        if (headerHex.startsWith('ffd8ff')) return 'image/jpeg';
        if (headerHex.startsWith('424d')) return 'image/bmp';
        if (headerHex.startsWith('52494646')) {
            // RIFF — 可能是 WEBP
            // 需要读取更多字节来确认
            if (arr.length >= 12) {
                const webpMark = String.fromCharCode(arr[8], arr[9], arr[10], arr[11]);
                if (webpMark === 'WEBP') return 'image/webp';
            }
        }
        if (headerHex.startsWith('4949') || headerHex.startsWith('4d4d')) return 'image/tiff';
        if (headerHex.startsWith('000000') && arr.length >= 12) {
            // ISO Base Media File Format (HEIC/AVIF)
            const ftypCheck = String.fromCharCode(arr[4], arr[5], arr[6], arr[7]);
            if (ftypCheck === 'ftyp') {
                const brand = String.fromCharCode(arr[8], arr[9], arr[10], arr[11]).trim();
                if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
                if (['avif', 'avis'].includes(brand)) return 'image/avif';
            }
        }
        // SVG 检测
        try {
            const textStart = new TextDecoder('utf-8').decode(arr.subarray(0, 24));
            if (textStart.trimStart().startsWith('<svg') || (textStart.includes('<?xml') && textStart.includes('svg'))) {
                return 'image/svg+xml';
            }
        } catch {
            // 忽略解码错误
        }

        return 'unknown';
    }

    async initializeComponents() {

        // Initialize base components first
        this.variableProcessor = new VariableProcessor(this.app, this.settings);
        this.linkFormatter = new LinkFormatter(this.app);
        this.imageProcessor = new ImageProcessor(this.supportedImageFormats);

        if (this.settings.isImageResizeEnbaled) {
            this.imageResizer = new ImageResizer(this);
            this.addChild(this.imageResizer);
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView) {
                this.imageResizer.attachView(activeView);
            }
        }

        // Initialize components that depend on others
        this.folderAndFilenameManagement = new FolderAndFilenameManagement(
            this.app,
            this.settings,
            this.supportedImageFormats,
            this.variableProcessor
        );

        this.batchImageProcessor = new BatchImageProcessor(
            this.app,
            this,
            this.imageProcessor,
            this.folderAndFilenameManagement
        );

        // Initialize context menu if enabled
        if (this.settings.enableContextMenu) {
            this.contextMenu = new ContextMenu(
                this.app,
                this,
                this.folderAndFilenameManagement,
                this.variableProcessor
            );
        }

        // REDUNDANT as it is already initialized inside ImageConverterSettings %%Initialize NonDestructiveResizeSettings if needed%%
        // if (!this.settings.nonDestructiveResizeSettings) {
        //     this.settings.nonDestructiveResizeSettings = new NonDestructiveResizeSettings();
        // }

        // Register PASTE/DROP events
        this.dropPasteRegisterEvents();

        // Register file menu events
        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file) => {
                if (file instanceof TFile && this.supportedImageFormats.isSupported(undefined, file.name)) {
                    menu.addItem((item) => {
item.setTitle(t('main.menu.processImage'))
                            .setIcon("cog")
                            .onClick(() => {
                                new ProcessSingleImageModal(this.app, this, file).open();
                            });
                    });
                } else if (file instanceof TFolder) {
                    menu.addItem((item) => {
                        // eslint-disable-next-line obsidianmd/ui/sentence-case
item.setTitle(t('main.menu.processAllInFolder'))
                            .setIcon("cog")
                            .onClick(() => {
                                new ProcessFolderModal(this.app, this, file.path, this.batchImageProcessor).open();
                            });
                    });
                } else if (file instanceof TFile && (file.extension === 'md' || file.extension === 'canvas')) {
                    menu.addItem((item) => {
item.setTitle(file.extension === 'md' ? t('main.menu.processAllInNote') : t('main.menu.processAllInCanvas'))
                            .setIcon("cog")
                            .onClick(() => {
                                new ProcessCurrentNote(this.app, this, file, this.batchImageProcessor).open();
                            });
                    });
                }
            })
        );

        // Register editor-menu event for inserting figure references
        this.registerEvent(
            this.app.workspace.on("editor-menu", (menu, editor) => {
                menu.addItem((item) => {
                    item
                        .setTitle(t('figureRef.insertReference'))
                        .setIcon("link")
                        .onClick(() => {
                            const figures = scanFigureIds(editor);
                            if (figures.length === 0) {
                                new Notice(t('figureRef.notice.noFiguresInNote'));
                                return;
                            }
                            new FigureReferenceSuggestModal(this.app, figures, editor).open();
                        });
                });
            })
        );

        // Register commands
        this.addCommand({
            id: 'insert-figure-reference',
            name: t('figureRef.insertReferenceCommand'),
            editorCallback: (editor: Editor) => {
                const figures = scanFigureIds(editor);
                if (figures.length === 0) {
                    new Notice(t('figureRef.notice.noFiguresInNote'));
                    return;
                }
                new FigureReferenceSuggestModal(this.app, figures, editor).open();
            }
        });

        this.addCommand({
            id: 'process-all-vault-images',
            name: 'Process all vault images',
            callback: () => {
                new ProcessAllVaultModal(this.app, this, this.batchImageProcessor).open();
            }
        });

        this.addCommand({
            id: 'process-all-images-current-note',
            name: 'Process all images in current note',
            callback: () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    new ProcessCurrentNote(this.app, this, activeFile, this.batchImageProcessor).open();
                } else {
new Notice(t('main.notice.noActiveFileDetected'));
                }
            }
        });

        this.addCommand({
            // eslint-disable-next-line obsidianmd/commands/no-plugin-id-in-command-id -- not to break bindings
            id: 'open-image-converter-settings',
            // eslint-disable-next-line obsidianmd/commands/no-plugin-name-in-command-name, obsidianmd/ui/sentence-case -- not to break bindings
            name: 'Open Image Converter Settings',
            callback: () => this.commandOpenSettingsTab()
        });

        this.addReloadCommand();
    }


    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async onunload() {
        // Clean up alignment related components first
        if (this.ImageAlignmentManager) {
            this.ImageAlignmentManager.onunload();
            this.ImageAlignmentManager = null;
        }

        // Clean up resizer reference (it will be unloaded automatically as a child)
        if (this.imageResizer) {
            this.imageResizer = null;
        }

        // Clean up UI components
        if (this.contextMenu) {
            this.contextMenu.onunload();
        }

        // Clean up modals
        [
            this.processSingleImageModal,
            this.processFolderModal,
            this.processCurrentNote,
            this.processAllVaultModal
        ].forEach(modal => {
            if (modal?.close) modal.close();
        });

        // Clean up any open modals
        [
            this.processSingleImageModal,
            this.processFolderModal,
            this.processCurrentNote,
            this.processAllVaultModal
        ].forEach(modal => {
            if (modal?.close) modal.close();
        });

        document.body.classList.remove('image-captions-enabled');
    }


    // Load settings method
    async loadSettings() {
        const loadedSettings = (await this.loadData()) as Partial<ImageConverterSettings> | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedSettings ?? {}) as ImageConverterSettings;

        // eslint-disable-next-line obsidianmd/hardcoded-config-path -- legacy stored value for migration
        const legacyCacheLocation = ".obsidian";
        if ((this.settings.imageAlignmentCacheLocation as string) === legacyCacheLocation) {
            this.settings.imageAlignmentCacheLocation = "config";
            await this.saveSettings();
        }
    }

    // Save settings method
    async saveSettings() {
        await this.saveData(this.settings);
    }

    /**
     * 注册文件修改事件，在 Markdown 文件被修改时规范化换行符。
     * 根据设置中的 lineEnding 选项，将文件内容中的换行符统一为 LF 或 CRLF。
     */
    // 规范化单个文件的换行符
    private async normalizeFileLineEndings(file: TFile): Promise<void> {
        if (this.isNormalizingLineEndings) return;
        // 仅处理 Markdown 和 Canvas 文件
        if (file.extension !== 'md' && file.extension !== 'canvas') return;

        try {
            const content = await this.app.vault.read(file);
            let normalizedContent: string;

            if (this.settings.lineEnding === 'lf') {
                // 将 CRLF 替换为 LF
                normalizedContent = content.replace(/\r\n/g, '\n');
            } else {
                // 先统一为 LF，再替换为 CRLF，避免出现 \r\r\n
                normalizedContent = content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
            }

            if (normalizedContent !== content) {
                this.isNormalizingLineEndings = true;
                await this.app.vault.modify(file, normalizedContent);
                this.isNormalizingLineEndings = false;
            }
        } catch (error) {
            this.isNormalizingLineEndings = false;
            console.error('Failed to normalize line endings:', error);
        }
    }

    private setupLineEndingNormalizer(): void {
        // 文件修改时规范化换行符
        this.registerEvent(
            this.app.vault.on('modify', async (file) => {
                if (!(file instanceof TFile)) return;
                await this.normalizeFileLineEndings(file);
            })
        );

        // 文件打开时规范化换行符（仅在设置中启用时生效）
        this.registerEvent(
            this.app.workspace.on('file-open', async (file) => {
                if (!file) return;
                if (!this.settings.normalizeLineEndingOnOpen) return;
                await this.normalizeFileLineEndings(file);
            })
        );
    }

    // Command to open settings tab
    async commandOpenSettingsTab() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- Obsidian internal API
        const setting = (this.app as any).setting as { open: () => Promise<void>; openTabById: (id: string) => void } | undefined;
        if (setting) {
            await setting.open();
            setting.openTabById(this.manifest.id);
        } else {
new Notice(t('main.notice.unableToOpenSettings'));
        }
    }

    addReloadCommand() {

        this.addCommand({
            id: 'reload-plugin',
            name: 'Reload plugin',
            callback: async () => {
                // eslint-disable-next-line obsidianmd/ui/sentence-case
new Notice(t('main.notice.reloadingPlugin'));
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- Obsidian internal API
                const plugins = (this.app as any).plugins as { disablePlugin: (id: string) => Promise<void>; enablePlugin: (id: string) => Promise<void> } | undefined;

                try {
                    // 1. Disable the plugin
                    if (plugins?.disablePlugin) {
                        await plugins.disablePlugin(this.manifest.id);
                    } else {
                        console.error("Plugins API is not accessible.");
new Notice(t('main.notice.failedToReload'));
                        return;
                    }

                    // add some delay as disabling takes some time.
                    await new Promise(resolve => setTimeout(resolve, 500)); // even 100ms would be enough.

                    // 2. Re-enable the plugin
                    if (plugins?.enablePlugin) {
                        await plugins.enablePlugin(this.manifest.id);
                    } else {
                        console.error("Plugins API is not accessible.");
new Notice(t('main.notice.failedToReload'));
                        return;
                    }

                    // eslint-disable-next-line obsidianmd/ui/sentence-case
new Notice(t('main.notice.pluginReloaded'));
                } catch (error) {
                    console.error("Error reloading plugin:", error);
new Notice(t('main.notice.failedToReloadSeeConsole'));
                }
            },
        });
    }

    private dropPasteRegisterEvents() {
        // On mobile DROP events are not supported, but lets still check as a precaution
        if (Platform.isMobile) return;

        // Drop event (Obsidian editor - primary handlers)
        this.registerEvent(
            this.app.workspace.on("editor-drop", async (evt: DragEvent, editor: Editor) => {
                if (!evt.dataTransfer) {
                    console.warn("DataTransfer object is null initially. Cannot process drop event.");
                    return;
                }

                // Get the actual drop position from the mouse event
                const pos = editor.posAtMouse(evt);
                if (!pos) {
                    console.warn("Could not determine drop position");
                    return;
                }

                const fileData: { name: string, type: string, file: File }[] = [];
                for (let i = 0; i < evt.dataTransfer.files.length; i++) {
                    const file = evt.dataTransfer.files[i];
                    fileData.push({ name: file.name, type: file.type, file });
                }

                // Check if we should process these files
                const hasSupportedFiles = fileData.some(data =>
                    this.supportedImageFormats.isSupported(data.type, data.name) &&
                    !this.folderAndFilenameManagement.matchesPatterns(data.name, this.settings.neverProcessFilenames)
                );

                if (hasSupportedFiles) {
                    evt.preventDefault(); // Prevent default behavior

                    // We don't need setTimeout anymore since we're using the drop position
                    await this.handleDrop(fileData, editor, evt, pos);
                }
            })
        );

        // --- Paste event handler ---
        this.registerEvent(
            this.app.workspace.on("editor-paste", async (evt: ClipboardEvent, editor: Editor) => {
                if (!evt.clipboardData) {
                    console.warn("ClipboardData object is null. Cannot process paste event.");
                    return;
                }

                const cursor = editor.getCursor();

                // 尝试从剪贴板的 text/html 数据中提取原始图片 URL 和文件名
                // 当从网页右键复制图片粘贴时，浏览器给 File 对象的默认名称通常是 image.png，
                // 但 HTML 数据中包含原始 URL，我们可以从中提取真实文件名
                let originalImageFilename: string | null = null;
                let originalImageUrl: string | null = null;
                const htmlData = evt.clipboardData.getData("text/html");
                if (htmlData) {
                    const imgSrcMatch = htmlData.match(/<img[^>]+src=["']([^"']+)["']/i);
                    if (imgSrcMatch) {
                        try {
                            const parsedUrl = new URL(imgSrcMatch[1]);
                            const urlPath = parsedUrl.pathname;
                            const urlFilename = decodeURIComponent(urlPath.split("/").pop() || "");
                            // 确保提取到的文件名有效（包含扩展名且不是空的）
                            if (urlFilename && urlFilename.includes(".")) {
                                originalImageFilename = urlFilename;
                                // 保存完整的原始 URL，用于后续可能的 GIF 下载
                                if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
                                    originalImageUrl = imgSrcMatch[1];
                                }
                            }
                        } catch {
                            // URL 解析失败，尝试直接从路径中提取
                            const simplePath = imgSrcMatch[1].split("?")[0].split("#")[0];
                            const simpleFilename = decodeURIComponent(simplePath.split("/").pop() || "");
                            if (simpleFilename && simpleFilename.includes(".")) {
                                originalImageFilename = simpleFilename;
                                // 尝试保存完整 URL
                                if (imgSrcMatch[1].startsWith("http://") || imgSrcMatch[1].startsWith("https://")) {
                                    originalImageUrl = imgSrcMatch[1];
                                }
                            }
                        }
                    }
                }

                // ===== 第一步：同步读取剪贴板数据并判断是否需要处理 =====
                // 重要：clipboardData 在异步操作后可能不可用（浏览器安全策略），
                // 且 evt.preventDefault() 必须在同步代码中尽早调用，否则 Obsidian 默认的粘贴行为会先执行。

                // 判断是否为 GIF：通过文件名扩展名或剪贴板中 HTML 内容检测
                const isGifByFilename = originalImageFilename && originalImageFilename.toLowerCase().endsWith(".gif");
                const isGifByHtml = htmlData && /\.gif[\s"'?#]|image\/gif/i.test(htmlData);
                const isLikelyGif = isGifByFilename || isGifByHtml;

                // 同步提取剪贴板中的文件数据（必须在 await 之前完成）
                const clipboardFiles: { kind: string, type: string, file: File | null }[] = [];
                for (let i = 0; i < evt.clipboardData.items.length; i++) {
                    const item = evt.clipboardData.items[i];
                    let file = item.kind === "file" ? item.getAsFile() : null;

                    // 如果从 HTML 中提取到了原始文件名，且当前 file 使用的是浏览器默认名称，
                    // 则创建一个带有正确文件名的新 File 对象
                    if (file && originalImageFilename && /^image\.\w+$/i.test(file.name)) {
                        // 使用原始 URL 中的文件名，但扩展名以剪贴板文件为准
                        // 例如：原始是 .gif 但剪贴板中是 .png（静态第一帧），则用 .png 扩展名
                        const originalExt = originalImageFilename.substring(originalImageFilename.lastIndexOf(".")).toLowerCase();
                        const fileExt = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
                        const finalName = originalExt === fileExt
                            ? originalImageFilename
                            : originalImageFilename.substring(0, originalImageFilename.lastIndexOf(".")) + fileExt;
                        file = new File([file], finalName, { type: file.type });
                    }

                    clipboardFiles.push({ kind: item.kind, type: item.type, file });
                }

                // 同步检查是否有支持的图片文件
                const hasSupportedItems = clipboardFiles.some(data =>
                    data.kind === "file" &&
                    data.file &&
                    this.supportedImageFormats.isSupported(data.type, data.file.name) &&
                    !this.folderAndFilenameManagement.matchesPatterns(data.file.name, this.settings.neverProcessFilenames)
                );

                // 如果有支持的图片或检测到 GIF，立即阻止 Obsidian 默认粘贴行为
                if (!hasSupportedItems && !isLikelyGif) {
                    return; // 没有支持的图片，让 Obsidian 默认处理
                }
                evt.preventDefault();

                // ===== 第二步：异步下载 GIF（如果需要） =====
                // 此时默认行为已被阻止，可以安全地执行异步操作
                let downloadedGifFile: File | null = null;

                if (originalImageUrl && isLikelyGif) {
                    try {
                        const response = await requestUrl({ url: originalImageUrl });
                        if (response.status === 200 && response.arrayBuffer.byteLength > 0) {
                            // 验证下载内容是否确实是 GIF 格式（检查 magic bytes: GIF87a 或 GIF89a）
                            const header = new Uint8Array(response.arrayBuffer, 0, 6);
                            const isRealGif = header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46; // "GIF"
                            if (isRealGif) {
                                let gifFilename = originalImageFilename || `image-${Date.now()}.gif`;
                                if (!gifFilename.toLowerCase().endsWith(".gif")) {
                                    const dotIndex = gifFilename.lastIndexOf(".");
                                    gifFilename = (dotIndex > 0 ? gifFilename.substring(0, dotIndex) : gifFilename) + ".gif";
                                }
                                downloadedGifFile = new File(
                                    [response.arrayBuffer],
                                    gifFilename,
                                    { type: "image/gif" }
                                );
                            }
                        }
                    } catch (error) {
                        console.warn("Failed to download original GIF, falling back to clipboard data:", error);
                    }
                }

                // ===== 第三步：构建最终的 itemData =====
                const itemData: { kind: string, type: string, file: File | null }[] = [];

                if (downloadedGifFile) {
                    // 成功下载了 GIF 文件，使用下载的 GIF 替换剪贴板中的静态图片
                    itemData.push({ kind: "file", type: "image/gif", file: downloadedGifFile });
                } else if (isLikelyGif && originalImageUrl) {
                    // GIF 下载失败，但我们知道原始文件是 GIF
                    // 剪贴板中只有静态的 PNG（GIF 的第一帧），无法保留动画
                    // 提示用户下载失败，使用静态图片作为回退
                    console.warn("GIF download failed. Using static PNG from clipboard as fallback.");
                    new Notice(t('main.notice.gifDownloadFailed'));
                    itemData.push(...clipboardFiles);
                } else {
                    itemData.push(...clipboardFiles);
                }

                // 重新检查是否有支持的文件（下载 GIF 后 itemData 可能变化）
                const hasFinalSupportedItems = itemData.some(data =>
                    data.kind === "file" &&
                    data.file &&
                    this.supportedImageFormats.isSupported(data.type, data.file.name) &&
                    !this.folderAndFilenameManagement.matchesPatterns(data.file.name, this.settings.neverProcessFilenames)
                );

                if (hasFinalSupportedItems) {
                    await this.handlePaste(itemData, editor, cursor);
                }
            })
        );
    }

    private async handleDrop(fileData: { name: string; type: string; file: File }[], editor: Editor, evt: DragEvent, cursor: EditorPosition) {

        // Step 1: Filter Supported Files
        // - Filter the incoming `fileData` to keep only the files that are supported by the plugin (using `isSupported`).
        const supportedFiles = fileData
            .filter(data => {
                // console.log(`Dropped file: ${data.name}, file.type: ${data.type}`);
                return this.supportedImageFormats.isSupported(data.type, data.name)
            })
            .map(data => data.file);

        // Step 2: Check for Active File
        // - Return early if no supported files are found or if there's no active file in the Obsidian workspace.
        if (supportedFiles.length === 0) return;

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
new Notice(t('main.notice.noActiveFileDetected'));
            return;
        }

        // Step 3: Map Files to Processing Promises
        // - Create an array of promises, each responsible for processing one file.
        // - This allows for sequential processing, avoiding concurrency issues.
        const filePromises = supportedFiles.map(async (file) => {
            try {
                // Check modal behavior setting
                const { modalBehavior } = this.settings;
                let showModal = modalBehavior === "always";

                if (modalBehavior === "ask") {
                    showModal = await new Promise<boolean>((resolve) => {
                        new ConfirmDialog(
                            this.app,
                            "Show Preset Selection Modal?",
                            "Do you want to select presets for this image?",
                            "Yes",
                            () => resolve(true)
                        ).open();
                    });
                }

                let selectedConversionPreset: ConversionPreset;
                let selectedFilenamePreset: FilenamePreset;
                let selectedFolderPreset: FolderPreset;
                let selectedLinkFormatPreset: LinkFormatPreset;
                let selectedResizePreset: NonDestructiveResizePreset;

                if (showModal) {
                    // Show the modal and wait for user selection
                    ({
                        selectedConversionPreset,
                        selectedFilenamePreset,
                        selectedFolderPreset,
                        selectedLinkFormatPreset,
                        selectedResizePreset
                    } = await new Promise<{
                        selectedConversionPreset: ConversionPreset;
                        selectedFilenamePreset: FilenamePreset;
                        selectedFolderPreset: FolderPreset;
                        selectedLinkFormatPreset: LinkFormatPreset;
                        selectedResizePreset: NonDestructiveResizePreset;
                    }>((resolve) => {
                        new PresetSelectionModal(
                            this.app,
                            this.settings,
                            (conversionPreset, filenamePreset, folderPreset, linkFormatPreset, resizePreset) => {
                                resolve({
                                    selectedConversionPreset: conversionPreset,
                                    selectedFilenamePreset: filenamePreset,
                                    selectedFolderPreset: folderPreset,
                                    selectedLinkFormatPreset: linkFormatPreset,
                                    selectedResizePreset: resizePreset,
                                });
                            },
                            this,
                            this.variableProcessor
                        ).open();
                    }));
                } else {
                    // Use default presets from settings using the generic getter
                    selectedConversionPreset = this.getPresetByName(
                        this.settings.selectedConversionPreset,
                        this.settings.conversionPresets,
                        'Conversion'
                    );

                    selectedFilenamePreset = this.getPresetByName(
                        this.settings.selectedFilenamePreset,
                        this.settings.filenamePresets,
                        'Filename'
                    );

                    selectedFolderPreset = this.getPresetByName(
                        this.settings.selectedFolderPreset,
                        this.settings.folderPresets,
                        'Folder'
                    );

                    selectedLinkFormatPreset = this.getPresetByName(
                        this.settings.linkFormatSettings.selectedLinkFormatPreset,
                        this.settings.linkFormatSettings.linkFormatPresets,
                        'Link Format'
                    );

                    selectedResizePreset = this.getPresetByName(
                        this.settings.nonDestructiveResizeSettings.selectedResizePreset,
                        this.settings.nonDestructiveResizeSettings.resizePresets,
                        'Resize'
                    );
                }

                // Step 3.2: Determine Destination and Filename
                // - Use the `determineDestination` function to calculate the destination path and new filename for the current file.
                let destinationPath: string;
                let newFilename: string;

                try {
                    ({ destinationPath, newFilename } = await this.folderAndFilenameManagement.determineDestination(
                        file,
                        activeFile,
                        selectedConversionPreset,
                        selectedFilenamePreset,
                        selectedFolderPreset
                    ));
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    console.error("Error determining destination and filename:", errorMessage);
new Notice(t('main.notice.failedToDetermineDestination', { name: file.name }));
                    return; // Resolve this promise (no further processing for this file)
                }

                // Rest of the steps (3.3 to 3.7) remain the same,
                // using selectedConversionPreset and selectedFilenamePreset
                // ...
                // Step 3.3: Create Destination Folder
                // - Create the destination folder if it doesn't exist.
                try {
                    await this.folderAndFilenameManagement.ensureFolderExists(destinationPath);
                } catch (error) {
                    // Ignore "Folder already exists" error, but handle other errors.
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    if (!errorMessage.startsWith('Folder already exists')) {
                        console.error("Error creating folder:", errorMessage);
new Notice(t('main.notice.failedToCreateFolder', { path: destinationPath }));
                        return; // Resolve this promise
                    }
                }

                // Step 3.4: Handle Filename Conflicts
                // - Check if a file with the same name already exists at the destination.
                // - Apply conflict resolution rules based on the selected filename preset (e.g., increment, reuse, or skip).
                const fullPath = `${destinationPath}/${newFilename}`;
                let existingFile = this.app.vault.getAbstractFileByPath(fullPath);
                let skipFurtherProcessing = false;

                if (selectedFilenamePreset && this.folderAndFilenameManagement.shouldSkipRename(file.name, selectedFilenamePreset)) {
new Notice(
                        t('main.notice.skippedConversion', { name: file.name })
                    );
                    skipFurtherProcessing = true;
                } else if (selectedFilenamePreset && selectedFilenamePreset.conflictResolution === "increment") {
                    try {
                        newFilename = await this.folderAndFilenameManagement.handleNameConflicts(
                            destinationPath,
                            newFilename,
                            "increment"
                        );
                        existingFile = this.app.vault.getAbstractFileByPath(
                            `${destinationPath}/${newFilename}`
                        );
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        console.error("Error handling filename conflicts:", errorMessage);
new Notice(t('main.notice.errorIncrementingFilename', { name: file.name }));
                        return; // Resolve this promise
                    }
                }

                const newFullPath = this.folderAndFilenameManagement.combinePath(destinationPath, newFilename);

                // Step 3.5: Process, Reuse, or Skip
                if (!skipFurtherProcessing) {

                    // Step 3.5.1: Reuse Existing File (if applicable)
                    // - If a file exists and the preset is set to "reuse," insert a link to the existing file and skip processing.
                    if (existingFile && selectedFilenamePreset && selectedFilenamePreset.conflictResolution === "reuse") {
                        try {
                            await this.insertLinkAtCursorPosition(editor, existingFile.path, cursor, selectedLinkFormatPreset, selectedResizePreset);
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            console.error("Failed to insert link for reused file:", errorMessage);
new Notice(t('main.notice.failedToInsertLink', { name: existingFile.name }));
                        }
                        return; // Resolve this promise
                    }


                    // Step 3.5.2: Check for Skipped Conversion BEFORE Processing
                    // - Check if the current file matches a skip pattern defined in the selected conversion preset.
                    // - If it matches, skip the image processing step entirely.
                    if (selectedConversionPreset && this.folderAndFilenameManagement.shouldSkipConversion(file.name, selectedConversionPreset)) {
new Notice(t('main.notice.skippedConversion', { name: file.name }));


                        // Save the original file directly to the vault without any processing.
                        // const originalSize = file.size;
                        const fileBuffer = await file.arrayBuffer();
                        // Vault.createBinary returns a TFile or throws on failure (no null result).
                        const tfile = await this.app.vault.createBinary(newFullPath, fileBuffer);

                        // Insert a link to the newly created (but unprocessed) file.
                        try {
                            await this.insertLinkAtCursorPosition(editor, tfile.path, cursor, selectedLinkFormatPreset, selectedResizePreset);
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            console.error("Failed to insert link for skipped conversion:", errorMessage);
new Notice(t('main.notice.failedToInsertLink', { name: file.name }));
                        }

                    } else {
                        // Step 3.5.3: Process the Image (ONLY if not skipped)
                        // - Call the `processImage` function to perform image conversion based on the selected preset or default settings.
                        try {
                            const originalSize = file.size;  // Store original size
                            this.processedImage = await this.imageProcessor.processImage(
                                file,
                                selectedConversionPreset
                                    ? selectedConversionPreset.outputFormat
                                    : this.settings.outputFormat,
                                selectedConversionPreset
                                    ? selectedConversionPreset.quality / 100
                                    : this.settings.quality / 100,
                                selectedConversionPreset
                                    ? selectedConversionPreset.colorDepth
                                    : this.settings.colorDepth,
                                selectedConversionPreset
                                    ? selectedConversionPreset.resizeMode
                                    : this.settings.resizeMode,
                                selectedConversionPreset
                                    ? selectedConversionPreset.desiredWidth
                                    : this.settings.desiredWidth,
                                selectedConversionPreset
                                    ? selectedConversionPreset.desiredHeight
                                    : this.settings.desiredHeight,
                                selectedConversionPreset
                                    ? selectedConversionPreset.desiredLongestEdge
                                    : this.settings.desiredLongestEdge,
                                selectedConversionPreset
                                    ? selectedConversionPreset.enlargeOrReduce
                                    : this.settings.enlargeOrReduce,
                                selectedConversionPreset
                                    ? selectedConversionPreset.allowLargerFiles
                                    : this.settings.allowLargerFiles,
                                selectedConversionPreset, // Pass preset to ImageProcessor
                                this.settings
                            );


                            let tfile: TFile;

                            // Step 3.5.4: Create the Image File in Vault
                            // - Create the new image file in the Obsidian vault using `createBinary`.
                            // Show space savings notification
                            // Check if processed image is larger than original + minimum savings
                            const minSavingsKB = (typeof (selectedConversionPreset?.minimumCompressionSavingsInKB ?? this.settings.minimumCompressionSavingsInKB) === 'number'
                                && (selectedConversionPreset?.minimumCompressionSavingsInKB ?? this.settings.minimumCompressionSavingsInKB) >= 0)
                                ? (selectedConversionPreset?.minimumCompressionSavingsInKB ?? this.settings.minimumCompressionSavingsInKB)
                                : 30;
                            const shouldRevertIfLarger = selectedConversionPreset?.revertToOriginalIfLarger
                                ?? this.settings.revertToOriginalIfLarger;

                            if (shouldRevertIfLarger && this.processedImage.byteLength + (minSavingsKB * 1024) > originalSize) {
                                // User wants to revert AND processed image is larger
                                this.showSizeComparisonNotification(originalSize, this.processedImage.byteLength);
new Notice(t('main.notice.usingOriginalImage', { name: file.name, size: String(minSavingsKB) }));

                                const fileBuffer = await file.arrayBuffer();
                                tfile = await this.app.vault.createBinary(newFullPath, fileBuffer);
                            } else {
                                // Processed image is smaller OR user doesn't want to revert
                                this.showSizeComparisonNotification(originalSize, this.processedImage.byteLength);
                                tfile = await this.app.vault.createBinary(newFullPath, this.processedImage);
                            }

                            // Step 3.5.5: Insert Link into Editor
                            // - Insert the Markdown link to the newly created image file into the editor at the current cursor position.
                            try {
                                await this.insertLinkAtCursorPosition(editor, tfile.path, cursor, selectedLinkFormatPreset, selectedResizePreset);
                            } catch (error) {
                                const errorMessage = error instanceof Error ? error.message : String(error);
                                console.error("Failed to insert link after processing:", errorMessage);
new Notice(t('main.notice.failedToInsertLink', { name: file.name }));
                            }
                        } catch (error) {
                            // Step 3.5.6: Handle Image Processing Errors
                            // - Catch and display errors that occur during image processing.
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            console.error("Image processing failed:", errorMessage);
                            if (error instanceof Error) {
                                if (error.message.includes("File already exists")) {
new Notice(t('main.notice.failedToProcessFileExists', { name: newFilename }));
                                } else if (error.message.includes("Invalid input file type")) {
new Notice(t('main.notice.failedToProcessInvalidType', { name: file.name }));
                                } else {
new Notice(t('main.notice.failedToProcessImage', { name: file.name, error: error.message }));
                                }
                            } else {
new Notice(t('main.notice.failedToProcessImage', { name: file.name, error: '' }));
                            }
                            return; // Resolve this promise
                        } finally {
                            // Clear memory after processing
                            this.clearMemory();
                        }
                    }
                } else {
                    // Step 3.6: Handle Skipped Processing
                    // - If further processing is skipped due to filename conflict resolution, insert a link to an existing file (if applicable).
                    if (existingFile) {
                        try {
                            await this.insertLinkAtCursorPosition(editor, existingFile.path, cursor, selectedLinkFormatPreset, selectedResizePreset);
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            console.error("Failed to insert link for skipped processing:", errorMessage);
new Notice(t('main.notice.failedToInsertLink', { name: existingFile.name }));
                        }
                    }
                }
            } catch (error) {
                // Step 3.7: Handle Unexpected Errors
                // - Catch and display any other unexpected errors that might occur.
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error("An unexpected error occurred:", errorMessage);
new Notice(t('main.notice.unexpectedError'));
            }
        });

        // Step 4: Wait for All Promises to Complete
        // - Use `Promise.all` to wait for all the file processing promises to settle (either fulfilled or rejected).
        await Promise.all(filePromises);
        
        if (this.settings.enableImageCaptions) {
            this.captionManager.refresh();
        }
    }

    private async handlePaste(itemData: { kind: string; type: string; file: File | null }[], editor: Editor, cursor: EditorPosition) {
        // Step 1: Filter Supported Image Files
        // - Filter the pasted `itemData` to keep only supported image files.
        const supportedFiles = itemData
            .filter(data => data.kind === "file" && data.file &&
                this.supportedImageFormats.isSupported(data.type, data.file.name))
            .map(data => data.file!)
            .filter((file): file is File => file !== null);

        // Step 2: Check for Active File
        // - Return early if no supported files are found or if there's no active file.
        if (supportedFiles.length === 0) return;

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
new Notice(t('main.notice.noActiveFileDetected'));
            return;
        }

        // Step 3: Map Files to Processing Promises
        // - Create an array of promises, each responsible for processing one pasted file.
        const filePromises = supportedFiles.map(async (file) => {
            // Check modal behavior setting
            const { modalBehavior } = this.settings;
            let showModal = modalBehavior === "always";

            if (modalBehavior === "ask") {
                showModal = await new Promise<boolean>((resolve) => {
                    new ConfirmDialog(
                        this.app,
                        "Show Preset Selection Modal?",
                        "Do you want to select presets for this image?",
                        "Yes",
                        () => resolve(true)
                    ).open();
                });
            }

            let selectedConversionPreset: ConversionPreset;
            let selectedFilenamePreset: FilenamePreset;
            let selectedFolderPreset: FolderPreset;
            let selectedLinkFormatPreset: LinkFormatPreset;
            let selectedResizePreset: NonDestructiveResizePreset;

            if (showModal) {
                // Show the modal and wait for user selection
                ({
                    selectedConversionPreset,
                    selectedFilenamePreset,
                    selectedFolderPreset,
                    selectedLinkFormatPreset,
                    selectedResizePreset
                } = await new Promise<{
                    selectedConversionPreset: ConversionPreset;
                    selectedFilenamePreset: FilenamePreset;
                    selectedFolderPreset: FolderPreset;
                    selectedLinkFormatPreset: LinkFormatPreset;
                    selectedResizePreset: NonDestructiveResizePreset;
                }>((resolve) => {
                    new PresetSelectionModal(
                        this.app,
                        this.settings,
                        (conversionPreset, filenamePreset, folderPreset, linkFormatPreset, resizePreset) => {
                            resolve({
                                selectedConversionPreset: conversionPreset,
                                selectedFilenamePreset: filenamePreset,
                                selectedFolderPreset: folderPreset,
                                selectedLinkFormatPreset: linkFormatPreset,
                                selectedResizePreset: resizePreset,
                            });
                        },
                        this,
                        this.variableProcessor
                    ).open();
                }));
            } else {
                // Use default presets from settings using the generic getter
                selectedConversionPreset = this.getPresetByName(
                    this.settings.selectedConversionPreset,
                    this.settings.conversionPresets,
                    'Conversion'
                );

                selectedFilenamePreset = this.getPresetByName(
                    this.settings.selectedFilenamePreset,
                    this.settings.filenamePresets,
                    'Filename'
                );

                selectedFolderPreset = this.getPresetByName(
                    this.settings.selectedFolderPreset,
                    this.settings.folderPresets,
                    'Folder'
                );

                selectedLinkFormatPreset = this.getPresetByName(
                    this.settings.linkFormatSettings.selectedLinkFormatPreset,
                    this.settings.linkFormatSettings.linkFormatPresets,
                    'Link Format'
                );

                selectedResizePreset = this.getPresetByName(
                    this.settings.nonDestructiveResizeSettings.selectedResizePreset,
                    this.settings.nonDestructiveResizeSettings.resizePresets,
                    'Resize'
                );
            }
            // Step 3.2: Determine Destination and Filename
            // - Calculate the destination path and new filename for the current file.
            try {
                let destinationPath: string;
                let newFilename: string;

                try {
                    ({ destinationPath, newFilename } = await this.folderAndFilenameManagement.determineDestination(
                        file,
                        activeFile,
                        selectedConversionPreset,
                        selectedFilenamePreset,
                        selectedFolderPreset
                    ));
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    console.error("Error determining destination and filename:", errorMessage);
new Notice(t('main.notice.failedToDetermineDestination', { name: file.name }));
                    return; // Resolve this promise
                }

                // Step 3.3: Create Destination Folder
                // - Create the destination folder if it doesn't exist.
                try {
                    await this.folderAndFilenameManagement.ensureFolderExists(destinationPath);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    if (!errorMessage.startsWith('Folder already exists')) {
                        console.error("Error creating folder:", errorMessage);
new Notice(t('main.notice.failedToCreateFolder', { path: destinationPath }));
                        return; // Resolve this promise
                    }
                }

                // Step 3.4: Handle Filename Conflicts
                // - Check for filename conflicts and apply conflict resolution rules.
                const fullPath = `${destinationPath}/${newFilename}`;
                let existingFile = this.app.vault.getAbstractFileByPath(fullPath);
                let skipFurtherProcessing = false;

                if (
                    selectedFilenamePreset &&
                    this.folderAndFilenameManagement.shouldSkipRename(
                        file.name,
                        selectedFilenamePreset
                    )
                ) {
new Notice(
                        t('main.notice.skippedConversion', { name: file.name })
                    );
                    skipFurtherProcessing = true;
                } else if (
                    selectedFilenamePreset &&
                    selectedFilenamePreset.conflictResolution === "increment"
                ) {
                    try {
                        newFilename = await this.folderAndFilenameManagement.handleNameConflicts(
                            destinationPath,
                            newFilename,
                            "increment"
                        );
                        existingFile = this.app.vault.getAbstractFileByPath(
                            `${destinationPath}/${newFilename}`
                        );
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        console.error("Error handling filename conflicts:", errorMessage);
new Notice(t('main.notice.errorIncrementingFilename', { name: file.name }));
                        return; // Resolve this promise
                    }
                }

                const newFullPath = this.folderAndFilenameManagement.combinePath(destinationPath, newFilename);

                // Step 3.5: Process, Reuse, or Skip
                if (!skipFurtherProcessing) {
                    // Step 3.5.1: Reuse Existing File (if applicable)
                    // - If the file exists and the preset is set to "reuse," insert a link to the existing file.
                    if (existingFile && selectedFilenamePreset && selectedFilenamePreset.conflictResolution === "reuse") {
                        try {
                            await this.insertLinkAtCursorPosition(editor, existingFile.path, cursor, selectedLinkFormatPreset, selectedResizePreset);
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            console.error("Failed to insert link for reused file:", errorMessage);
new Notice(t('main.notice.failedToInsertLink', { name: existingFile.name }));
                        }
                        return;
                    }

                    // Step 3.5.2: Check for Skipped Conversion BEFORE Processing
                    // - Check if the current file matches a skip pattern in the conversion preset.
                    // - If it matches, skip image processing entirely.
                    if (selectedConversionPreset && this.folderAndFilenameManagement.shouldSkipConversion(file.name, selectedConversionPreset)) {
new Notice(t('main.notice.skippedConversion', { name: file.name }));

                        // Save the original file directly to the vault without any processing.
                        // const originalSize = file.size;
                        const fileBuffer = await file.arrayBuffer();
                        // Vault.createBinary returns a TFile or throws on failure (no null result).
                        const tfile = await this.app.vault.createBinary(newFullPath, fileBuffer);

                        // Insert a link to the newly created (unprocessed) file.
                        try {
                            await this.insertLinkAtCursorPosition(editor, tfile.path, cursor, selectedLinkFormatPreset, selectedResizePreset);
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            console.error("Failed to insert link for skipped conversion:", errorMessage);
new Notice(t('main.notice.failedToInsertLink', { name: file.name }));
                        }
                    } else {
                        // Step 3.5.3: Process the Image (ONLY if not skipped)
                        // - Process the image using the selected or default settings.
                        try {
                            const originalSize = file.size;
                            this.processedImage = await this.imageProcessor.processImage(
                                file,
                                selectedConversionPreset
                                    ? selectedConversionPreset.outputFormat
                                    : this.settings.outputFormat,
                                selectedConversionPreset
                                    ? selectedConversionPreset.quality / 100
                                    : this.settings.quality / 100,
                                selectedConversionPreset
                                    ? selectedConversionPreset.colorDepth
                                    : this.settings.colorDepth,
                                selectedConversionPreset
                                    ? selectedConversionPreset.resizeMode
                                    : this.settings.resizeMode,
                                selectedConversionPreset
                                    ? selectedConversionPreset.desiredWidth
                                    : this.settings.desiredWidth,
                                selectedConversionPreset
                                    ? selectedConversionPreset.desiredHeight
                                    : this.settings.desiredHeight,
                                selectedConversionPreset
                                    ? selectedConversionPreset.desiredLongestEdge
                                    : this.settings.desiredLongestEdge,
                                selectedConversionPreset
                                    ? selectedConversionPreset.enlargeOrReduce
                                    : this.settings.enlargeOrReduce,
                                selectedConversionPreset
                                    ? selectedConversionPreset.allowLargerFiles
                                    : this.settings.allowLargerFiles,
                                selectedConversionPreset, // Pass preset to ImageProcessor
                                this.settings
                            );

                            let tfile: TFile;
                            // Step 3.5.4: Create the Image File in Vault
                            // - Create the new image file in the Obsidian vault using `createBinary`.
                            // - Show space savings notification
                            // Check if processed image is larger than original + minimum savings
                            const minSavingsKB = (typeof (selectedConversionPreset?.minimumCompressionSavingsInKB ?? this.settings.minimumCompressionSavingsInKB) === 'number'
                                && (selectedConversionPreset?.minimumCompressionSavingsInKB ?? this.settings.minimumCompressionSavingsInKB) >= 0)
                                ? (selectedConversionPreset?.minimumCompressionSavingsInKB ?? this.settings.minimumCompressionSavingsInKB)
                                : 30;
                            const shouldRevertIfLarger = selectedConversionPreset?.revertToOriginalIfLarger
                                ?? this.settings.revertToOriginalIfLarger;

                            if (shouldRevertIfLarger && this.processedImage.byteLength + (minSavingsKB * 1024) > originalSize) {
                                // User wants to revert AND processed image is larger
                                this.showSizeComparisonNotification(originalSize, this.processedImage.byteLength);
new Notice(t('main.notice.usingOriginalImage', { name: file.name, size: String(minSavingsKB) }));

                                const fileBuffer = await file.arrayBuffer();
                                tfile = await this.app.vault.createBinary(newFullPath, fileBuffer);
                            } else {
                                // Processed image is smaller OR user doesn't want to revert
                                this.showSizeComparisonNotification(originalSize, this.processedImage.byteLength);
                                tfile = await this.app.vault.createBinary(newFullPath, this.processedImage);
                            }

                            // Step 3.5.5: Insert Link into Editor
                            // - Insert the link to the new image into the editor.
                            try {
                                await this.insertLinkAtCursorPosition(editor, tfile.path, cursor, selectedLinkFormatPreset, selectedResizePreset);
                            } catch (error) {
                                const errorMessage = error instanceof Error ? error.message : String(error);
                                console.error("Failed to insert link after processing:", errorMessage);
new Notice(t('main.notice.failedToInsertLink', { name: file.name }));
                            }
                        } catch (error) {
                            // Step 3.5.6: Handle Image Processing Errors
                            // - Handle errors during image processing.
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            console.error("Image processing failed:", errorMessage);
                            if (error instanceof Error) {
                                if (error.message.includes("File already exists")) {
new Notice(t('main.notice.failedToProcessFileExists', { name: newFilename }));
                                } else if (error.message.includes("Invalid input file type")) {
new Notice(t('main.notice.failedToProcessInvalidType', { name: file.name }));
                                } else {
new Notice(t('main.notice.failedToProcessImage', { name: file.name, error: error.message }));
                                }
                            } else {
new Notice(t('main.notice.failedToProcessImage', { name: file.name, error: '' }));
                            }
                            return; // Resolve this promise
                        }
                    }
                } else {
                    // Step 3.6: Handle Skipped Processing
                    // - If skipping, insert a link to an existing file or do nothing.
                    if (existingFile) {
                        try {
                            await this.insertLinkAtCursorPosition(editor, existingFile.path, cursor, selectedLinkFormatPreset, selectedResizePreset);
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            console.error("Failed to insert link for skipped processing:", errorMessage);
new Notice(t('main.notice.failedToInsertLink', { name: existingFile.name }));
                        }
                    }
                }
            } catch (error) {
                // Step 3.7: Handle Unexpected Errors
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error("An unexpected error occurred:", errorMessage);
new Notice(t('main.notice.unexpectedError'));
            } finally {
                // Clear memory after processing
                this.clearMemory();
            }
        });

        // Step 4: Wait for All Promises to Complete
        // - Wait for all file processing promises to settle.
        await Promise.all(filePromises);

        if (this.settings.enableImageCaptions) {
            this.captionManager.refresh();
        }
    }

    // Helper function to insert link at the specified cursor position
    private async insertLinkAtCursorPosition(
        editor: Editor,
        linkPath: string,
        cursor: EditorPosition,
        selectedLinkFormatPreset?: LinkFormatPreset,
        selectedResizePreset?: NonDestructiveResizePreset
    ) {
        const activeFile = this.app.workspace.getActiveFile();

        // Use the passed presets or fall back to the plugin settings
        const linkFormatPresetToUse = selectedLinkFormatPreset || this.settings.linkFormatSettings.linkFormatPresets.find(
            (preset) => preset.name === this.settings.linkFormatSettings.selectedLinkFormatPreset
        );

        const resizePresetToUse = selectedResizePreset || this.settings.nonDestructiveResizeSettings.resizePresets.find(
            (preset) => preset.name === this.settings.nonDestructiveResizeSettings.selectedResizePreset
        );

        let formattedLink: string;
        try {
            // Await the result of formatLink
            formattedLink = await this.linkFormatter.formatLink(
                linkPath, // Pass the original linkPath
                linkFormatPresetToUse?.linkFormat || "wikilink",
                linkFormatPresetToUse?.pathFormat || "shortest",
                activeFile,
                resizePresetToUse, // Now using the selected resize preset
                linkFormatPresetToUse?.hideAltText ?? false
            );

            // ----- FRONT or BACK ---------
            // Insert the link at the saved cursor position
            // - FRONT:Keeps the cursor at the front by default (by doing nothing) when cursorLocation is "front"
            editor.replaceRange(formattedLink, cursor);

            // Use positive check for "back"
            // - We have to be carefull not to place it to the back 2 times.
            if (this.settings.dropPasteCursorLocation === "back") {
                editor.setCursor({
                    line: cursor.line,
                    ch: cursor.ch + formattedLink.length,
                });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Failed to insert image link:', errorMessage);
new Notice(t('main.notice.failedToInsertImageLink'));
            return;
        }

        // Apply default alignment if enabled
        if (
            this.settings.isImageAlignmentEnabled &&
            this.settings.imageAlignmentDefaultAlignment &&
            this.settings.imageAlignmentDefaultAlignment !== 'none' &&
            activeFile &&
            this.ImageAlignmentManager
        ) {
            try {
                const defaultAlign = this.settings.imageAlignmentDefaultAlignment;
                const alignmentAdded = await this.ImageAlignmentManager.ensureDefaultAlignment(
                    activeFile.path,
                    linkPath,
                    defaultAlign
                );

                // If alignment was added, refresh the view to apply it
                if (alignmentAdded) {
                    window.setTimeout(() => {
                        const currentFile = this.app.workspace.getActiveFile();
                        if (currentFile?.path === activeFile.path) {
                            this.ImageAlignmentManager?.applyAlignmentsToNote(activeFile.path)
                                .catch((err) => {
                                    const errorMessage = err instanceof Error ? err.message : String(err);
                                    console.error('Failed to apply alignments:', errorMessage);
                                });
                        }
                    }, 0);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('Failed to apply default alignment after insert:', errorMessage);
            }
        }
    }

    private formatFileSize(bytes: number): string {
        if (bytes < 1024) {
            return `${bytes} bytes`;
        }
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    showSizeComparisonNotification(originalSize: number, newSize: number) {
        if (!this.settings.showSpaceSavedNotification) return;

        const originalSizeFormatted = this.formatFileSize(originalSize);
        const newSizeFormatted = this.formatFileSize(newSize);

        const percentChange = ((newSize - originalSize) / originalSize * 100).toFixed(1);
        const changeSymbol = newSize > originalSize ? '+' : '';

        const message = `${originalSizeFormatted} → ${newSizeFormatted} (${changeSymbol}${percentChange}%)`;
        new Notice(message);
    }

    getPresetByName<T extends { name: string }>(
        presetName: string,
        presetArray: T[],
        presetType: string
    ): T {
        const preset = presetArray.find(candidate => candidate.name === presetName);
        if (!preset) {
            console.warn(`${presetType} preset "${presetName}" not found, using default`);
            return presetArray[0];
        }
        return preset;
    }

    private clearMemory() {
        // Clear the processed image buffer
        if (this.processedImage) {
            this.processedImage = null;
        }

        // Following might be pointless, but lets do it still  - clear any ArrayBuffers or Blobs in memory
        if (this.temporaryBuffers) {
            for (let i = 0; i < this.temporaryBuffers.length; i++) {
                this.temporaryBuffers[i] = null;
            }
            this.temporaryBuffers = [];
        }
    }
}
