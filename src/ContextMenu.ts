import {
	Menu,
	View,
	TFile,
	Notice,
	setIcon,
	Platform,
	Component,
	normalizePath,
	App,
	MenuItem,
	MarkdownView,
	Editor,
	Setting,
	Modal,
} from "obsidian";
// eslint-disable-next-line import/no-nodejs-modules -- Required for path manipulation; Obsidian runs on Electron with Node.js support
import * as path from "path";
import ImageConverterPlugin from "./main";
import { FolderAndFilenameManagement } from "./FolderAndFilenameManagement";
import { ConfirmDialog } from "./ImageConverterSettings";
import { VariableProcessor, VariableContext } from "./VariableProcessor";
import { ImageAnnotationModal } from "./ImageAnnotation";
import { Crop } from "./Crop";
import { ProcessSingleImageModal } from "./ProcessSingleImageModal";
import { getVaultConfigBoolean } from "./utils/vaultConfig";
import { t } from "./i18n";

interface ImageMatch {
	lineNumber: number;
	line: string;
	fullMatch: string;
}

/** Internal Obsidian Menu type with hide method (not in public API) */
type MenuWithHide = Menu & { hide?: () => void };

/** Internal MarkdownView type with file property (not in public API) */
type MarkdownViewWithFile = MarkdownView & { file?: TFile | null };

/** Internal MenuItem type with dom property for custom menu content (not in public API) */
type MenuItemWithDom = MenuItem & { dom?: HTMLElement };

/** Internal file explorer view type with revealInFolder method (not in public API) */
type FileExplorerView = { revealInFolder?: (file: TFile) => void };

export class ContextMenu extends Component {
	private contextMenuRegistered = false;
	private currentMenu: Menu | null = null;

	private readonly stopPropagationHandler = (e: Event) => e.stopPropagation();

	/**
	 * Safely gets the image path from an HTMLImageElement.
	 * Encapsulates the optional chaining pattern for FolderAndFilenameManagement.getImagePath.
	 */
	private getImagePathSafe(img: HTMLImageElement): string | null {
		return this.folderAndFilenameManagement?.getImagePath?.(img) ?? null;
	}

	/**
	 * Gets the file from a MarkdownView, handling the internal API.
	 */
	private getFileFromView(view: MarkdownView | null): TFile | null {
		if (!view) return null;
		return (view as MarkdownViewWithFile).file ?? null;
	}

	/**
	 * Hides a menu using the internal hide method.
	 */
	private hideMenu(menu: Menu): void {
		(menu as MenuWithHide).hide?.();
	}

	/**
	 * Gets the native menus config from the vault.
	 */
	private isNativeMenusEnabled(): boolean {
		return getVaultConfigBoolean(this.app, "nativeMenus");
	}

	/**
	 * Converts a canvas element to a Blob.
	 * @param canvas - The canvas element to convert.
	 * @param type - Optional MIME type for the blob (defaults to image/png).
	 * @returns A promise that resolves to a Blob.
	 */
	private canvasToBlob(canvas: HTMLCanvasElement, type?: string): Promise<Blob> {
		return new Promise((resolve, reject) => {
			canvas.toBlob(
				(result) => {
					if (result) resolve(result);
					else reject(new Error("Failed to create blob from canvas"));
				},
				type
			);
		});
	}

	private readonly documentClickHandler = (event: MouseEvent) => {
		if (
			!(event.target as HTMLElement).closest(
				".image-converter-contextmenu-info-container"
			) &&
			!(event.target as HTMLElement).closest(".menu-item")
		) {
			if (this.currentMenu) {
				this.hideMenu(this.currentMenu);
			}
		}
	};

	constructor(
		private app: App,
		private plugin: ImageConverterPlugin,
		private folderAndFilenameManagement: FolderAndFilenameManagement,
		private variableProcessor: VariableProcessor
	) {
		super();
		this.registerContextMenuListener();
	}

	/*-----------------------------------------------------------------*/
	/*                       CONTEXT MENU SETUP                        */
	/*-----------------------------------------------------------------*/

	/**
	 * Registers the context menu listener on the document.
	 * This listener will trigger the context menu when an image is right-clicked.
	 */
	registerContextMenuListener() {
		if (this.contextMenuRegistered) {
			return;
		}

		this.registerDomEvent(
			document,
			"contextmenu",
			this.handleContextMenuEvent,
			true
		);
		this.contextMenuRegistered = true;
	}

	/**
	 * Handles the context menu event.
	 * This function is called when the context menu is triggered on an image.
	 * @param event - The MouseEvent object.
	 */
	handleContextMenuEvent = (event: MouseEvent) => {
		const target = event.target as HTMLElement;
		const activeView = this.app.workspace.getActiveViewOfType(View);
		const isCanvasView = activeView?.getViewType() === "canvas";

		if (isCanvasView) {
			return;
		}

		const img =
			target instanceof HTMLImageElement ? target : target.closest("img");
		if (!img) {
			return;
		}

		// Skip Excalidraw images
		if (this.plugin.supportedImageFormats.isExcalidrawImage(img)) {
			return;
		}

		const isImageInSupportedContainer = !!(
			(
				img.closest(".markdown-preview-view") ||
				img.closest(".markdown-source-view")
			)
			// img.closest('.view-content > div') // uncomment this to enable it inside its individual window
		);
		if (!isImageInSupportedContainer) {
			if (target.closest(".map-view-main")) {
				return;
			}
			return;
		}

		event.preventDefault(); // prevents the default context menu from appearing (if any)
		event.stopPropagation(); // prevents the event from bubbling up to parent elements (like the callout)

	   const menu = new Menu();
	   let activeFile = this.app.workspace.getActiveFile();
	   if (!activeFile) {
		  // Fallback: try to get file from MarkdownView (file property exists but isn't in public types)
		  const mv = this.app.workspace.getActiveViewOfType(MarkdownView);
		  activeFile = this.getFileFromView(mv);
	   }

		if (activeFile) {
			this.createContextMenuItems(menu, img, activeFile, event);
		}

		menu.showAtMouseEvent(event);
	};

	/*-----------------------------------------------------------------*/
	/*                     CONTEXT MENU ITEM CREATION                  */
	/*-----------------------------------------------------------------*/

	/**
	 * Creates the items for the context menu.
	 * @param menu - The Menu object to add items to.
	 * @param img - The HTMLImageElement that was right-clicked.
	 * @param activeFile - The currently active TFile.
	 * @param event - The MouseEvent object.
	 * @returns True if the menu was created successfully.
	 */
	createContextMenuItems(
		menu: Menu,
		img: HTMLImageElement,
		activeFile: TFile,
		event: MouseEvent
	) {
		this.currentMenu = menu;

		this.addRenameAndMoveInputs(menu, img, activeFile);

		menu.addSeparator();

		if (!Platform.isMobile) {
			this.addOpenInNewWindowMenuItem(menu, img);
			menu.addSeparator();
			this.addCutImageMenuItem(menu, event);
		}

		this.addCopyImageMenuItem(menu, event);
		this.addCopyBase64ImageMenuItem(menu, event);

		menu.addSeparator();

		// Only add image alignment if enabled
		if (
			this.plugin.settings.isImageAlignmentEnabled &&
			this.plugin.ImageAlignmentManager
		) {
			this.plugin.ImageAlignmentManager.addAlignmentOptionsToContextMenu(
				menu,
				img,
				activeFile
			);
		}

		this.addProcessImageMenuItem(menu, img, event); // Pass the event here

		this.addCropRotateFlipMenuItem(menu, img);

		this.addAnnotateImageMenuItem(menu, img);

		menu.addSeparator();

		// 缩放图片（zoom 百分比）和 figure 标题
		this.addZoomImageMenuItem(menu, img, activeFile);
		this.addFigureCaptionMenuItem(menu, img, activeFile);

		menu.addSeparator();

		if (!Platform.isMobile) {
			this.addShowInNavigationMenuItem(menu, img);
			this.addShowInSystemExplorerMenuItem(menu, img);
		}

		menu.addSeparator();
		this.addDeleteImageAndLinkMenuItem(menu, event);

		return true;
	}

	/*-----------------------------------------------------------------*/
	/*                        CAPTION INPUT                            */
	/*-----------------------------------------------------------------*/

	private async loadCurrentCaption(
		img: HTMLImageElement,
		activeFile: TFile
	): Promise<string> {
		try {
			const imagePath = this.getImagePathSafe(img);
			if (!imagePath) return "";

			const activeView =
				this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!activeView) return "";

			const { editor } = activeView;
			const isExternal = !imagePath;
			const matches = await this.findImageMatches(
				editor,
				imagePath,
				isExternal
			);

			if (matches && matches.length > 0) {
				const [firstMatch] = matches;

				const inTable = this.isTableRow(firstMatch.line);

				// Handle wiki-style links
				if (firstMatch.fullMatch.startsWith("![[") && firstMatch.fullMatch.endsWith("]]")) {
					const inner = firstMatch.fullMatch.slice(3, -2);

					// Check if this wikilink uses escaped delimiters (Obsidian may auto-escape in tables)
					// If it contains \| but no unescaped |, parse with escaped delimiters
					const hasEscapedPipes = inner.includes("\\|");
					const hasUnescapedPipes = /(?<!\\)\|/.test(inner);

					const isDimensions = (part: string) =>
						/^\s*\d+(?:x\d+)?\s*$/.test(part);

					let parts: string[];
					if (hasEscapedPipes && !hasUnescapedPipes) {
						// Obsidian-escaped format: ![[path\|caption\|dimensions]]
						parts = inner.split(/\\\|/);
					} else {
						// Standard format: ![[path|caption|dimensions]]
						// Split on unescaped pipes, keeping escaped pipes intact
						parts = inner.split(/(?<!\\)\|/);
					}

					if (parts.length >= 2) {
						const secondPart = parts[1] ?? "";
						const thirdPart = parts[2] ?? "";

						// If third part exists and is a dimension, second part is caption
						if (thirdPart && isDimensions(thirdPart)) {
							return this.unescapePipes(secondPart.trim());
						}
						// If third part exists but is not a dimension, second part is caption if not dimension-like
						if (thirdPart && !isDimensions(secondPart)) {
							return this.unescapePipes(secondPart.trim());
						}
						// If only second part exists and is not a dimension, it's the caption
						if (!thirdPart && !isDimensions(secondPart)) {
							return this.unescapePipes(secondPart.trim());
						}
					}
					return "";
				}

				// Handle markdown-style links in tables: ![caption\|dimensions](path)
				// For markdown links in tables, the pipe between caption and dimensions IS escaped.
				if (inTable) {
					const mdTableMatch = firstMatch.fullMatch.match(/!\[([^\]]*)\]\(([^)]+)\)/);
					if (mdTableMatch) {
						const alt = mdTableMatch[1] ?? "";
						const parts = alt.split(/\\\|/);
						if (parts.length > 1) {
							const isDimensions = (part: string) => /^\s*\d+(?:x\d+)?\s*$/.test(part);
							const last = parts[parts.length - 1] ?? "";
							const captionParts = isDimensions(last) ? parts.slice(0, -1) : parts;
							return captionParts.join("|").trim();
						}
						// Single part means no escaped pipe - just return it
						return this.unescapePipes(parts[0].trim());
					}
				}

				// Handle markdown-style links (non-table)
				const markdownMatch = firstMatch.fullMatch.match(
					/!\[([^|\]]*?)(?:\\?\|(\d+x\d+))?\]\(([^)]+)\)/
				);
				if (markdownMatch) {
					const caption = markdownMatch[1] || "";
					// If the delimiter pipe was escaped (\\|), markdownMatch[1] may end with a stray '\\'.
					return this.unescapePipes(caption.replace(/\\$/, "").trim());
				}

				// Handle HTML <img> tags
				const imgTagMatch = firstMatch.fullMatch.match(/<img\s+[^>]*src="([^"]*)"[^>]*\/?>/i);
				if (imgTagMatch) {
					const altMatch = firstMatch.fullMatch.match(/alt="([^"]*)"/i);
					return altMatch ? altMatch[1] : "";
				}
			}
			return "";
		} catch (error) {
			console.error("Error loading caption:", error);
			return "";
		}
	}

	private async loadCurrentDimensions(
		img: HTMLImageElement,
		activeFile: TFile
	): Promise<{ width: string; height: string }> {
		try {
			const imagePath = this.getImagePathSafe(img);
			if (!imagePath) return { width: "", height: "" };

			const activeView =
				this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!activeView) return { width: "", height: "" };

			const { editor } = activeView;
			const isExternal = !imagePath;
			const matches = await this.findImageMatches(
				editor,
				imagePath,
				isExternal
			);

			if (matches && matches.length > 0) {
				const [firstMatch] = matches;

				const inTable = this.isTableRow(firstMatch.line);

				// Handle wiki-style links
				if (firstMatch.fullMatch.startsWith("![[") && firstMatch.fullMatch.endsWith("]]")) {
					const inner = firstMatch.fullMatch.slice(3, -2);

					// Check if this wikilink uses escaped delimiters (Obsidian may auto-escape in tables)
					// If it contains \| but no unescaped |, parse with escaped delimiters
					const hasEscapedPipes = inner.includes("\\|");
					const hasUnescapedPipes = /(?<!\\)\|/.test(inner);

					const isDimensions = (part: string) =>
						/^\s*\d+(?:x\d+)?\s*$/.test(part);

					let parts: string[];
					if (hasEscapedPipes && !hasUnescapedPipes) {
						// Obsidian-escaped format: ![[path\|caption\|dimensions]]
						parts = inner.split(/\\\|/);
					} else {
						// Standard format: ![[path|caption|dimensions]]
						// Split on unescaped pipes, keeping escaped pipes intact
						parts = inner.split(/(?<!\\)\|/);
					}

					if (parts.length >= 2) {
						const secondPart = parts[1] ?? "";
						const thirdPart = parts[2] ?? "";

						// Check third part first, then second part for dimensions
						let dimensionPart = "";
						if (isDimensions(thirdPart)) {
							dimensionPart = thirdPart.trim();
						} else if (isDimensions(secondPart)) {
							dimensionPart = secondPart.trim();
						}

						if (dimensionPart) {
							const dimParts = dimensionPart.split("x");
							return {
								width: dimParts[0],
								height: dimParts.length > 1 ? dimParts[1] : "",
							};
						}
					}
					return { width: "", height: "" };
				}

				// Handle markdown-style links in tables: ![caption\|dimensions](path)
				// For markdown links in tables, the pipe between caption and dimensions IS escaped.
				if (inTable) {
					const mdTableMatch = firstMatch.fullMatch.match(/!\[([^\]]*)\]\(([^)]+)\)/);
					if (mdTableMatch) {
						const alt = mdTableMatch[1] ?? "";
						const parts = alt.split(/\\\|/);
						if (parts.length > 1) {
							const last = parts[parts.length - 1] ?? "";
							const isDimensions = (part: string) => /^\s*\d+(?:x\d+)?\s*$/.test(part);
							if (isDimensions(last)) {
								const dimParts = last.trim().split("x");
								return { width: dimParts[0], height: dimParts.length > 1 ? dimParts[1] : "" };
							}
						}
					}
				}

				// Handle markdown-style links (non-table)
				const markdownMatch = firstMatch.fullMatch.match(
					/!\[([^|\]]*?)(?:\\?\|(\d+(?:x\d+)?))?\]\(([^)]+)\)/
				);
				if (markdownMatch && markdownMatch[2]) {
					const parts = markdownMatch[2].split("x");
					return {
						width: parts[0],
						height: parts.length > 1 ? parts[1] : "",
					};
				}

				// Handle HTML <img> tags
				const imgTagMatch = firstMatch.fullMatch.match(/<img\s+[^>]*src="([^"]*)"[^>]*\/?>/i);
				if (imgTagMatch) {
					const widthMatch = firstMatch.fullMatch.match(/width="(\d+)"/i);
					const heightMatch = firstMatch.fullMatch.match(/height="(\d+)"/i);
					return {
						width: widthMatch ? widthMatch[1] : "",
						height: heightMatch ? heightMatch[1] : "",
					};
				}
			}
			return { width: "", height: "" };
		} catch (error) {
			console.error("Error loading dimensions:", error);
			return { width: "", height: "" };
		}
	}

	private async updateImageLinkWithDimensions(
		editor: Editor,
		match: { lineNumber: number; line: string },
		newCaption: string,
		width: string,
		height: string
	): Promise<string> {
		// Format dimensions based on what's provided
		const dimensionsPart = width
			? height
				? `${width}x${height}`
				: width
			: "";

		const { line } = match;

		// Check if line is inside a table row
		const inTable = this.isTableRow(line);

		// In tables, Obsidian's table parser runs BEFORE the wikilink parser.
		// This means pipes inside ![[...]] are still treated as column delimiters.
		// We must escape ALL pipes (delimiter and content) in tables to prevent column splits.
		// The ImageCaptionManager will strip the trailing backslash from rendered captions.
		//
		// For markdown links (![...]()), the same applies to the alt text section.
		const escapedCaption = inTable
			? this.escapePipesForTable(newCaption)
			: newCaption;

		// Pipe character: escaped in tables to prevent table column split
		const wikiPipe = inTable ? "\\|" : "|";

		// Handle Wiki-style links
		if (line.includes("![[")) {
			return line.replace(
				/!\[\[([^\]]+?)(?:\\?\|([^|\]]+?))?\s*(?:\\?\|([^|\]]+?))?\]\]/g,
				(fullMatch, path) => {
					if (escapedCaption && dimensionsPart) {
						return `![[${path}${wikiPipe}${escapedCaption}${wikiPipe}${dimensionsPart}]]`;
					}
					if (escapedCaption) {
						return `![[${path}${wikiPipe}${escapedCaption}]]`;
					}
					if (dimensionsPart) {
						return `![[${path}${wikiPipe}${dimensionsPart}]]`;
					}
					return `![[${path}]]`;
				}
			);
		}

		// Handle HTML <img> tags
		const imgTagMatch = line.match(/<img\s+[^>]*src="([^"]*)"[^>]*\/?>/i);
		if (imgTagMatch) {
			return line.replace(
				/<img\s+[^>]*src="([^"]*)"[^>]*\/?>/gi,
				(fullMatch, src) => {
					// 构建新的 <img> 标签，保留 src 和 style 中的 zoom
					const zoomMatch = fullMatch.match(/style="[^"]*zoom:\s*(\d+)%/);
					const zoomPart = zoomMatch ? `zoom:${zoomMatch[1]}%;` : "";

					let attrs = `src="${src}"`;
					if (newCaption) {
						attrs += ` alt="${newCaption}"`;
					}
					if (dimensionsPart) {
						const dimParts = dimensionsPart.split("x");
						attrs += ` width="${dimParts[0]}"`;
						if (dimParts.length > 1) {
							attrs += ` height="${dimParts[1]}"`;
						}
					}
					if (zoomPart) {
						attrs += ` style="${zoomPart}"`;
					}
					return `<img ${attrs} />`;
				}
			);
		}

		// Handle Markdown-style links
		// For markdown, the pipe between caption and dimension in alt text needs escaping in tables
		const mdPipe = inTable ? "\\|" : "|";
		return line.replace(
			/!\[([^|\]]*?)(?:\\?\|(\d+(?:x\d+)?))?\]\(([^)]+)\)/g,
			(fullMatch, caption, dimensions, path) => {
				if (escapedCaption && dimensionsPart) {
					return `![${escapedCaption}${mdPipe}${dimensionsPart}](${path})`;
				}
				if (escapedCaption) {
					return `![${escapedCaption}](${path})`;
				}
				if (dimensionsPart) {
					return `![${mdPipe}${dimensionsPart}](${path})`;
				}
				return `![](${path})`;
			}
		);
	}

	private async handleDimensionsAndCaptionUpdate(
		menu: Menu,
		captionInput: HTMLInputElement,
		widthInput: HTMLInputElement,
		heightInput: HTMLInputElement,
		img: HTMLImageElement,
		activeFile: TFile,
		isImageResolvable: boolean
	) {
		if (!isImageResolvable) return;

		const newCaption = captionInput.value.trim();
		const width = widthInput.value.trim();
		const height = heightInput.value.trim();

		// Validate dimensions
		if (
			(width && !/^\d+$/.test(width)) ||
			(height && !/^\d+$/.test(height))
		) {
new Notice(t('contextMenu.notice.dimensionsMustBePositive'));
			return;
		}

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) return;

		const { editor } = activeView;
		const imagePath = this.getImagePathSafe(img);
		const isExternal = !imagePath;
		const matches = await this.findImageMatches(
			editor,
			imagePath,
			isExternal
		);

		if (matches.length === 0) {
new Notice(t('contextMenu.notice.failedToFindImageLink'));
			return;
		}

		const handleConfirmation = async () => {
			for (const match of matches) {
				const updatedLine = await this.updateImageLinkWithDimensions(
					editor,
					match,
					newCaption,
					width,
					height
				);
				editor.setLine(match.lineNumber, updatedLine);
			}
new Notice(t('contextMenu.notice.captionAndDimensionsUpdated'));
			this.plugin.captionManager?.refresh();
		};

		if (matches.length > 1) {
new ConfirmDialog(
				this.app,
				t('contextMenu.confirm.confirmUpdates'),
				t('contextMenu.confirm.foundMatchingLinks', { count: String(matches.length) }),
				t('contextMenu.confirm.update'),
				() => {
					handleConfirmation().catch((error: unknown) => {
						console.error("Failed to update image caption and dimensions:", error);
new Notice(t('contextMenu.notice.failedToUpdate'));
					});
				}
			).open();
		} else {
			await handleConfirmation();
		}

		this.hideMenu(menu);
	}

	/*-----------------------------------------------------------------*/
	/*                      RENAME AND MOVE IMAGE                      */
	/*-----------------------------------------------------------------*/

	// All event listeners use this.registerDomEvent()
	// The Component class's onunload() will clean these up automatically
	// Even though we add these listeners each time the menu is created, they'll be cleaned up when:

	// The menu is closed (DOM elements are removed)
	// The component is unloaded
	// The plugin is disabled
	/**
	 * Adds input fields for renaming and moving the image to the context menu.
	 * @param menu - The Menu object to add the input fields to.
	 * @param img - The HTMLImageElement that was right-clicked.
	 * @param activeFile - The currently active TFile.
	 */
	addRenameAndMoveInputs(
		menu: Menu,
		img: HTMLImageElement,
		activeFile: TFile
	) {
		const isNativeMenus = this.isNativeMenusEnabled();

		if (!isNativeMenus && !Platform.isMobile) {
			const imagePath = this.getImagePathSafe(img);
			const isImageResolvable = imagePath !== null;

			let fileNameWithoutExt = "";
			let directoryPath = "";
			let fileExtension = "";
			let obsidianVaultPathForRename: string | undefined;
			let file: TFile | File;

			if (isImageResolvable) {
				const parsedPath = path.parse(imagePath);
				fileNameWithoutExt = parsedPath.name;
				directoryPath = parsedPath.dir;
				fileExtension = parsedPath.ext;
				obsidianVaultPathForRename = imagePath;
				if (!directoryPath) {
					directoryPath = "/";
				}

				const abstractFile =
					this.app.vault.getAbstractFileByPath(imagePath);
				file =
					abstractFile instanceof TFile
						? abstractFile
						: new File([""], imagePath);
			}

		menu.addItem((item) => {
				const menuItem = item as MenuItemWithDom;

				// Create main container
				const inputContainer = document.createElement("div");
				inputContainer.className =
					"image-converter-contextmenu-info-container";

				// Create name input group
				const nameGroup = document.createElement("div");
				nameGroup.className = "image-converter-contextmenu-input-group";

				const nameIcon = document.createElement("div");
				nameIcon.className =
					"image-converter-contextmenu-icon-container";
				setIcon(nameIcon, "file-text");
				nameGroup.appendChild(nameIcon);

				const nameLabel = document.createElement("label");
nameLabel.textContent = t('contextMenu.nameLabel');
				nameLabel.setAttribute("for", "image-converter-name-input");
				nameGroup.appendChild(nameLabel);

				const nameInput = document.createElement("input");
				nameInput.type = "text";
				nameInput.value = fileNameWithoutExt;
nameInput.placeholder = t('contextMenu.namePlaceholder');
				nameInput.className = "image-converter-contextmenu-name-input";
				nameInput.id = "image-converter-name-input";
				if (!isImageResolvable) {
					nameInput.classList.add(
						"image-converter-contextmenu-disabled"
					);
				}
				nameGroup.appendChild(nameInput);

				// Create path input group
				const pathGroup = document.createElement("div");
				pathGroup.className = "image-converter-contextmenu-input-group";

				const pathIcon = document.createElement("div");
				pathIcon.className =
					"image-converter-contextmenu-icon-container";
				setIcon(pathIcon, "folder");
				pathGroup.appendChild(pathIcon);

				const pathLabel = document.createElement("label");
pathLabel.textContent = t('contextMenu.folderLabel');
				pathLabel.setAttribute("for", "image-converter-path-input");
				pathGroup.appendChild(pathLabel);

				const pathInput = document.createElement("input");
				pathInput.type = "text";
				pathInput.value = directoryPath;
pathInput.placeholder = t('contextMenu.folderPlaceholder');
				pathInput.className = "image-converter-contextmenu-path-input";
				pathInput.id = "image-converter-path-input";
				if (!isImageResolvable) {
					pathInput.classList.add(
						"image-converter-contextmenu-disabled"
					);
				}
				pathGroup.appendChild(pathInput);

				// Create caption input group
				const captionGroup = document.createElement("div");
				captionGroup.className =
					"image-converter-contextmenu-input-group";

				const captionIcon = document.createElement("div");
				captionIcon.className =
					"image-converter-contextmenu-icon-container";
				setIcon(captionIcon, "subtitles");
				captionGroup.appendChild(captionIcon);

				const captionLabel = document.createElement("label");
captionLabel.textContent = t('contextMenu.captionLabel');
				captionLabel.setAttribute(
					"for",
					"image-converter-caption-input"
				);
				captionGroup.appendChild(captionLabel);

				const captionInput = document.createElement("input");
				captionInput.type = "text";
captionInput.placeholder = t('contextMenu.captionLoading');
				captionInput.className =
					"image-converter-contextmenu-caption-input";
				captionInput.id = "image-converter-caption-input";
				captionGroup.appendChild(captionInput);

				// Create dimensions input group
				const dimensionsGroup = document.createElement("div");
				dimensionsGroup.className =
					"image-converter-contextmenu-input-group";

				const dimensionsIcon = document.createElement("div");
				dimensionsIcon.className =
					"image-converter-contextmenu-icon-container";
				setIcon(dimensionsIcon, "aspect-ratio");
				dimensionsGroup.appendChild(dimensionsIcon);

				const dimensionsLabel = document.createElement("label");
dimensionsLabel.textContent = t('contextMenu.sizeLabel');
				dimensionsLabel.setAttribute(
					"for",
					"image-converter-width-input"
				);
				dimensionsGroup.appendChild(dimensionsLabel);

				// Create width input
				const widthInput = document.createElement("input");
				widthInput.type = "number";
				widthInput.min = "1";
				widthInput.placeholder = "W";
				widthInput.className =
					"image-converter-contextmenu-dimension-input";
				widthInput.id = "image-converter-width-input";

				// Create height input
				const heightInput = document.createElement("input");
				heightInput.type = "number";
				heightInput.min = "1";
				heightInput.placeholder = "H";
				heightInput.className =
					"image-converter-contextmenu-dimension-input";
				heightInput.id = "image-converter-height-input";

				// Create dimension inputs container
				const dimensionInputsContainer = document.createElement("div");
				dimensionInputsContainer.className =
					"image-converter-contextmenu-dimension-inputs";
				dimensionInputsContainer.appendChild(widthInput);
				dimensionInputsContainer.appendChild(
					document.createTextNode("×")
				); // multiplication symbol
				dimensionInputsContainer.appendChild(heightInput);

				dimensionsGroup.appendChild(dimensionInputsContainer);

				// Load current dimensions
				this.loadCurrentDimensions(img, activeFile)
					.then(({ width, height }) => {
						widthInput.value = width;
						heightInput.value = height;
					})
					.catch((error: unknown) => {
						console.error("Failed to load dimensions:", error);
					});

				// Add all groups to container
				inputContainer.appendChild(nameGroup);
				inputContainer.appendChild(pathGroup);
				inputContainer.appendChild(captionGroup);
				inputContainer.appendChild(dimensionsGroup);

				// Add single confirm button
				const confirmButton = document.createElement("div");
				confirmButton.className =
					"image-converter-contextmenu-button image-converter-contextmenu-confirm";
				setIcon(confirmButton, "check");
				inputContainer.appendChild(confirmButton);

				// Register event listeners for all inputs
				[
					nameInput,
					pathInput,
					captionInput,
					widthInput,
					heightInput,
				].forEach((input) => {
					this.registerDomEvent(
						input,
						"mousedown",
						this.stopPropagationHandler
					);
					this.registerDomEvent(
						input,
						"click",
						this.stopPropagationHandler
					);
					this.registerDomEvent(
						input,
						"keydown",
						this.stopPropagationHandler
					);
				});

				this.registerDomEvent(
					document,
					"click",
					this.documentClickHandler
				);

				// Load the current caption asynchronously
				this.loadCurrentCaption(img, activeFile)
					.then((currentCaption) => {
						captionInput.value = currentCaption;
captionInput.placeholder = t('contextMenu.captionPlaceholder');
					})
					.catch((error: unknown) => {
						console.error("Failed to load caption:", error);
captionInput.placeholder = t('contextMenu.captionPlaceholder');
					});

				// Single confirm button handler
				this.registerDomEvent(confirmButton, "click", async () => {
					if (isImageResolvable) {
						// First handle rename and move
						await this.handleRenameAndMove(
							menu,
							nameInput,
							pathInput,
							img,
							isImageResolvable,
							fileNameWithoutExt,
							fileExtension,
							obsidianVaultPathForRename,
							file,
							activeFile
						);

						// Then handle caption and dimensions update together
						await this.handleDimensionsAndCaptionUpdate(
							menu,
							captionInput,
							widthInput,
							heightInput,
							img,
							activeFile,
							isImageResolvable
						);
					}
				});

				// Clear and set the menu item content (gracefully handle test mocks without a DOM property)
				const maybeDom = menuItem.dom as (HTMLElement & { empty?: () => void }) | undefined;
				if (maybeDom && typeof maybeDom.appendChild === "function") {
					// If Obsidian exposes a DOM element, populate it
					if (typeof maybeDom.empty === "function") {
						maybeDom.empty();
					} else {
						// Fallback: clear children
						while (maybeDom.firstChild) {
							maybeDom.removeChild(maybeDom.firstChild);
						}
					}
					maybeDom.appendChild(inputContainer);
				} else {
					// Minimal fallback for test environment without MenuItem DOM
					(menuItem as MenuItemWithDom & { setTitle?: (title: string) => void }).setTitle?.("Image tools");
				}
			});
		}
	}

	/**
	 * Handles the renaming and moving of the image.
	 * @param menu - The Menu object.
	 * @param nameInput - The HTMLInputElement for the new name.
	 * @param pathInput - The HTMLInputElement for the new path.
	 * @param img - The HTMLImageElement to rename/move.
	 * @param isImageResolvable - Boolean indicating if the image path can be resolved.
	 * @param fileNameWithoutExt - The current file name without extension.
	 * @param fileExtension - The file extension.
	 * @param obsidianVaultPathForRename - The original path of the image in the Obsidian vault.
	 */
	// - `\ / : * ? " < > | [ ] ( )` - INVALID characters
	// Leading and trailing dots (`.`) are removed.
	// Leading and trailing spaces are removed.
	// For more examples check sanitizeFilename inside FolderAndFilenameManagement.ts
	private readonly handleRenameAndMove = async (
		menu: Menu,
		nameInput: HTMLInputElement,
		pathInput: HTMLInputElement,
		img: HTMLImageElement,
		isImageResolvable: boolean,
		fileNameWithoutExt: string,
		fileExtension: string,
		obsidianVaultPathForRename: string | undefined,
		file: TFile | File,
		activeFile: TFile
	) => {
		if (!isImageResolvable) return;
		let newName = nameInput.value;
		let newDirectoryPath = pathInput.value;

		// --- Process variables in the input fields ---
		const variableContext: VariableContext = { file, activeFile };
		newName = await this.variableProcessor.processTemplate(
			newName,
			variableContext
		);
		newDirectoryPath = await this.variableProcessor.processTemplate(
			newDirectoryPath,
			variableContext
		);

		if (!newName.trim()) {
new Notice(t('contextMenu.notice.pleaseEnterNewName'));
			return;
		}

		newName = this.folderAndFilenameManagement.sanitizeFilename(newName);

		if (/^[.]+$/.test(newName.trim())) {
new Notice(t('contextMenu.notice.pleaseEnterValidName'));
			return;
		}
		if (!newDirectoryPath.trim()) {
new Notice(t('contextMenu.notice.pleaseEnterNewPath'));
			return;
		}

		if (obsidianVaultPathForRename) {
			try {
				// Handle Rename
				if (newName && newName !== fileNameWithoutExt) {
					const newPath = normalizePath(
						path.join(
							newDirectoryPath,
							`${newName}${fileExtension}`
						)
					);
					const abstractFile = this.app.vault.getAbstractFileByPath(
						obsidianVaultPathForRename
					);
					if (abstractFile instanceof TFile) {
						await this.folderAndFilenameManagement.ensureFolderExists(
							newDirectoryPath
						);
						await this.app.fileManager.renameFile(
							abstractFile,
							newPath
						);
						img.src = this.app.vault.getResourcePath(abstractFile);
new Notice(t('contextMenu.notice.imageNameUpdated'));
					}
				}
				// Handle Movea
				const currentNameWithExtension = `${newName}${fileExtension}`;
				const oldPath = obsidianVaultPathForRename;
				const newPath = normalizePath(
					path.join(newDirectoryPath, currentNameWithExtension)
				);

				if (newPath !== oldPath) {
					const abstractFile =
						this.app.vault.getAbstractFileByPath(oldPath);
					if (abstractFile instanceof TFile) {
						await this.folderAndFilenameManagement.ensureFolderExists(
							newDirectoryPath
						);

						if (oldPath.toLowerCase() === newPath.toLowerCase()) {
							const safeRenameSuccessful =
								await this.folderAndFilenameManagement.safeRenameFile(
									abstractFile,
									newPath
								);
							if (safeRenameSuccessful) {
new Notice(
									t('contextMenu.notice.imagePathUpdatedCaseSensitive')
								);
							} else {
new Notice(
									t('contextMenu.notice.imagePathUpdateFailedCaseSensitive')
								);
							}
						} else {
							await this.app.fileManager.renameFile(
								abstractFile,
								newPath
							);
new Notice(t('contextMenu.notice.imagePathUpdated'));
						}
						img.src = this.app.vault.getResourcePath(abstractFile);
						const leaf = this.app.workspace.getMostRecentLeaf();
						if (leaf) {
							const currentState = leaf.getViewState();
							await leaf.setViewState({
								type: "empty",
								state: {},
							});
							await leaf.setViewState(currentState);
						}
					}
				}
			} catch (error) {
				console.error("Failed to update image path:", error);
new Notice(t('contextMenu.notice.failedToUpdateImagePath'));
			}
		}
		this.hideMenu(menu);
	};

	/*-----------------------------------------------------------------*/
	/*                         OPEN IN NEW WINDOW                      */
	/*-----------------------------------------------------------------*/

	/**
	 * Adds the "Open in new window" menu item.
	 * @param menu - The Menu object to add the item to.
	 * @param img - The HTMLImageElement that was right-clicked.
	 */
	addOpenInNewWindowMenuItem(menu: Menu, img: HTMLImageElement) {
		menu.addItem((item) => {
item.setTitle(t('contextMenu.openInNewWindow'))
				.setIcon("square-arrow-out-up-right")
				.onClick(async () => {
					try {
						const imagePath =
							this.folderAndFilenameManagement.getImagePath(img);
						if (imagePath) {
							const file =
								this.app.vault.getAbstractFileByPath(imagePath);
							if (file instanceof TFile) {
								const leaf =
									this.app.workspace.getLeaf("window");
								if (leaf) {
									await leaf.openFile(file);
								}
							}
						}
					} catch (error) {
new Notice(t('contextMenu.notice.failedToOpenInNewWindow'));
						console.error(error);
					}
				});
		});
	}

	/*-----------------------------------------------------------------*/
	/*                        HELPER METHODS                           */
	/*-----------------------------------------------------------------*/

	/**
	 * Detects if a line is a markdown table row (not a separator line).
	 * A table row starts with `|` after trimming, but separator lines
	 * (e.g., `|---|---|`) are excluded unless they contain an image.
	 * @param line - The line to check.
	 * @returns True if the line is a table data row.
	 */
	private isTableRow(line: string): boolean {
		const trimmed = line.trim();
		if (!trimmed.startsWith("|")) return false;
		// Exclude separator lines like |---|---| unless they contain an image
		return !/^\|[\s-:]+\|$/.test(trimmed) || trimmed.includes("!");
	}

	/**
	 * Escapes unescaped pipe characters for use in table cells.
	 * Avoids double-escaping already escaped pipes.
	 * @param text - The text to escape.
	 * @returns The text with unescaped pipes escaped as `\|`.
	 */
	private escapePipesForTable(text: string): string {
		// Use negative lookbehind to only escape pipes not already escaped
		return text.replace(/(?<!\\)\|/g, "\\|");
	}

	/**
	 * Unescapes pipe characters for display in UI input fields.
	 * Converts `\|` back to `|`.
	 * @param text - The text to unescape.
	 * @returns The text with escaped pipes unescaped.
	 */
	private unescapePipes(text: string): string {
		return text.replace(/\\\|/g, "|");
	}

	/**
	 * Normalizes an image path for consistent comparison.
	 * Converts backslashes to forward slashes, replaces '%20' with spaces,
	 * removes query parameters, converts to lowercase, and trims whitespace.
	 *
	 * @param path - The image path to normalize.
	 * @returns The normalized image path, always starting with a '/'.
	 */
	private normalizeImagePath(path: string): string {
		if (!path) return "";

		// Decode URL encoded characters first
		let normalizedPath = decodeURIComponent(path);

		// Remove any URL parameters
		const [pathWithoutQuery] = normalizedPath.split("?");
		normalizedPath = pathWithoutQuery;

		// Convert backslashes to forward slashes
		normalizedPath = normalizedPath.replace(/\\/g, "/");

		// Handle spaces in paths
		normalizedPath = normalizedPath.replace(/%20/g, " ");

		// Ensure consistent leading slash
		if (!normalizedPath.startsWith("/")) {
			normalizedPath = `/${normalizedPath}`;
		}

		// Normalize any '../' or './' sequences
		normalizedPath = normalizePath(normalizedPath);

		return normalizedPath.toLowerCase();
	}

	/**
	 * Finds the line number where the frontmatter section ends in the editor.
	 *
	 * @param editor - The Obsidian Editor instance.
	 * @returns The line number of the frontmatter end, or -1 if not found.
	 */
	private findFrontmatterEnd(editor: Editor): number {
		let inFrontmatter = false;
		const lineCount = editor.getDoc().lineCount();

		for (let i = 0; i < lineCount; i++) {
			const line = editor.getLine(i).trim();
			if (line === "---") {
				if (!inFrontmatter && i === 0) {
					inFrontmatter = true;
				} else if (inFrontmatter) {
					return i;
				}
			}
		}
		return -1;
	}

	/**
	 * Extracts the filename from an image link, handling both wiki and markdown formats.
	 *
	 * @param link - The full image link.
	 * @returns The extracted filename, or null if not found.
	 */
	private extractFilenameFromLink(link: string): string | null {
		const wikiMatch = link.match(/!\[\[\s*([^|\]]+?)\s*(?:\|[^\]]+)?\]\]/);
		if (wikiMatch) {
			// In tables, delimiter pipes may be written as \\|, which leaves a trailing '\\' in group 1.
			return wikiMatch[1].trim().replace(/\\$/, "");
		}

		const markdownMatch = link.match(/!\[.*?\]\(\s*(.*?)\s*\)/);
		if (markdownMatch) {
			return markdownMatch[1].trim(); // Trim spaces
		}

		// Handle HTML <img> tags
		const imgTagMatch = link.match(/<img\s+[^>]*src="([^"]*)"[^>]*\/?>/i);
		if (imgTagMatch) {
			return imgTagMatch[1].trim();
		}

		return null;
	}

	/**
	 * Finds image links in the editor's content based on the provided criteria.
	 *
	 * @param editor - The Obsidian Editor instance.
	 * @param imagePath - The path of the image (for local images) or null (for external images).
	 * @param isExternal - A flag indicating whether the image is external.
	 * @returns An array of objects, each containing the line number, line content, and full match
	 *          for each matching image link found. Returns an empty array if no matches are found.
	 */
	private async findImageMatches(
		editor: Editor,
		imagePath: string | null,
		isExternal: boolean
	): Promise<{ lineNumber: number; line: string; fullMatch: string }[]> {
		// Helper function to resolve relative paths
		const resolveRelativePath = (
			linkPath: string,
			activeFilePath: string
		): string => {
			const activeFileDir = path.dirname(activeFilePath);
			if (linkPath.startsWith("./") || linkPath.startsWith("../")) {
				return normalizePath(path.join(activeFileDir, linkPath));
			}
			return normalizePath(linkPath);
		};

		const lineCount = editor.getDoc().lineCount();
		const frontmatterEnd = this.findFrontmatterEnd(editor);
		const matches: {
			lineNumber: number;
			line: string;
			fullMatch: string;
		}[] = [];
		const activeFile = this.app.workspace.getActiveFile();

		if (!activeFile) return matches;

		for (let i = frontmatterEnd + 1; i < lineCount; i++) {
			const line = editor.getLine(i);

			// Check wiki-style links (![[path/to/image.png]])  Added ? after last ] to be non-greedy
			const wikiMatches = [
				...line.matchAll(/!\[\[([^\]]+?)(?:\|[^\]]+?)??\]\]/g),
			];
			for (const match of wikiMatches) {
				const fullMatch = match[0].trim();

				const filename = this.extractFilenameFromLink(fullMatch);
				if (filename && !isExternal) {
					const resolvedPath = resolveRelativePath(
						filename,
						activeFile.path
					);

					if (imagePath) {
						const normalizedImagePath =
							this.normalizeImagePath(imagePath);
						const normalizedResolvedPath =
							this.normalizeImagePath(resolvedPath);

						// Check for exact match or if the normalized image path ends with the resolved path
						if (
							normalizedImagePath === normalizedResolvedPath ||
							normalizedImagePath.endsWith(normalizedResolvedPath)
						) {
							matches.push({ lineNumber: i, line, fullMatch });
							// console.log('Wiki match found:', {
							// 	normalizedImagePath,
							// 	normalizedResolvedPath,
							// 	fullMatch
							// });
						}
					}
				}
			}

			// Check markdown-style links (![alt](path/to/image.png))
			const mdMatches = [
				...line.matchAll(
					/!\[([^\]]*?)(?:\|\d+(?:\|\d+)?)?\]\(([^)]+)\)/g
				),
			];
			for (const match of mdMatches) {
				const [fullMatch, , linkPath] = match;

				if (!isExternal && linkPath) {
					const resolvedPath = resolveRelativePath(
						linkPath,
						activeFile.path
					);

					if (imagePath) {
						const normalizedImagePath =
							this.normalizeImagePath(imagePath);
						const normalizedResolvedPath =
							this.normalizeImagePath(resolvedPath);

						// Check for exact match or if the normalized image path ends with the resolved path
						let alreadyMatched = false;
						if (
							normalizedImagePath === normalizedResolvedPath ||
							normalizedImagePath.endsWith(normalizedResolvedPath)
						) {
							matches.push({ lineNumber: i, line, fullMatch });
							alreadyMatched = true;
							// console.log('Markdown match found:', {
							// 	normalizedImagePath,
							// 	normalizedResolvedPath,
							// 	fullMatch
							// });
						}

						// Additional check for paths starting with ./ (仅在上面没有匹配时才检查，避免重复)
						if (!alreadyMatched && linkPath.startsWith("./")) {
							const linkPathWithoutDotSlash =
								linkPath.substring(2);
							const normalizedLinkPathWithoutDotSlash =
								this.normalizeImagePath(
									linkPathWithoutDotSlash
								);

							if (
								normalizedImagePath.endsWith(
									normalizedLinkPathWithoutDotSlash
								)
							) {
								matches.push({
									lineNumber: i,
									line,
									fullMatch,
								});
								// console.log('Markdown dot-slash match found:', {
								// 	normalizedImagePath,
								// 	normalizedLinkPathWithoutDotSlash,
								// 	fullMatch
								// });
							}
						}
					}
				} else if (
					isExternal &&
					(linkPath.startsWith("http://") ||
						linkPath.startsWith("https://"))
				) {
				matches.push({ lineNumber: i, line, fullMatch });
					// console.log('External link match found:', {
					// 	linkPath,
					// 	fullMatch
					// });
				}
			}

			// 检查 HTML <img> 标签（支持已缩放的 img 标签被再次匹配）
			const imgTagMatches = [
				...line.matchAll(/<img\s+[^>]*src="([^"]*)"[^>]*\/?>/g),
			];
			for (const match of imgTagMatches) {
				const fullMatch = match[0];
				const tagSrc = match[1];

				if (!tagSrc) continue;

				if (!isExternal && imagePath) {
					const resolvedPath = resolveRelativePath(
						tagSrc,
						activeFile.path
					);

					const normalizedImagePath =
						this.normalizeImagePath(imagePath);
					const normalizedResolvedPath =
						this.normalizeImagePath(resolvedPath);
					const normalizedTagSrc =
						this.normalizeImagePath(tagSrc);

					if (
						normalizedImagePath === normalizedResolvedPath ||
						normalizedImagePath.endsWith(normalizedResolvedPath) ||
						normalizedImagePath === normalizedTagSrc ||
						normalizedImagePath.endsWith(normalizedTagSrc)
					) {
						matches.push({ lineNumber: i, line, fullMatch });
					}
				} else if (
					isExternal &&
					(tagSrc.startsWith("http://") ||
						tagSrc.startsWith("https://"))
				) {
					matches.push({ lineNumber: i, line, fullMatch });
				}
			}
		}

		// Log all matches for debugging
		// if (matches.length > 0) {
		// 	console.log('All matches found:', matches);
		// } else {
		// 	console.log('No matches found for:', {
		// 		imagePath,
		// 		isExternal
		// 	});
		// }

		return matches;
	}

	/**
	 * Processes the first Base64 image found in the editor's content.
	 *
	 * @param editor - The Obsidian Editor instance.
	 * @param src - The `src` attribute of the Base64 image to search for.
	 * @param processor - A callback function to process the matched Base64 image.
	 *                    This function takes the editor, line number, line content, and full match as arguments.
	 * @returns True if a Base64 image was found and processed, false otherwise.
	 */
	private async processBase64Image(
		editor: Editor,
		src: string,
		processor: (
			editor: Editor,
			lineNumber: number,
			line: string,
			fullMatch: string
		) => Promise<void>
	): Promise<boolean> {
		const lineCount = editor.getDoc().lineCount();
		for (let i = 0; i < lineCount; i++) {
			const line = editor.getLine(i);
			const base64Matches = [
				...line.matchAll(/<img\s+src="data:image\/[^"]+"\s*\/?>/g),
			];

			for (const match of base64Matches) {
				if (match[0].includes(src)) {
					await processor(editor, i, line, match[0]);
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * Helper method to remove an image link from the editor.
	 * @param editor - The Editor instance.
	 * @param lineNumber - The line number where the match was found.
	 * @param line - The line content.
	 * @param fullMatch - The full matched text.
	 * @param copyToClipboard - Whether to copy the text to clipboard before removing.
	 */
	private async removeImageLinkFromEditor(
		editor: Editor,
		lineNumber: number,
		line: string,
		fullMatch: string,
		copyToClipboard: boolean
	) {
		if (copyToClipboard) {
			await navigator.clipboard.writeText(fullMatch);
		}

		const startPos = {
			line: lineNumber,
			ch: line.indexOf(fullMatch),
		};
		const endPos = {
			line: lineNumber,
			ch: startPos.ch + fullMatch.length,
		};

		// Calculate trailing whitespace
		let trailingWhitespace = 0;
		while (
			line[endPos.ch + trailingWhitespace] === " " ||
			line[endPos.ch + trailingWhitespace] === "\t"
		) {
			trailingWhitespace++;
		}

		// If this is the only content on the line, delete the entire line
		if (line.trim() === fullMatch.trim()) {
			editor.replaceRange(
				"",
				{ line: lineNumber, ch: 0 },
				{ line: lineNumber + 1, ch: 0 }
			);
		} else {
			// Otherwise, just delete the match and its trailing whitespace
			editor.replaceRange("", startPos, {
				line: lineNumber,
				ch: endPos.ch + trailingWhitespace,
			});
		}
	}

	/*-----------------------------------------------------------------*/
	/*                           CUT IMAGE                             */
	/*-----------------------------------------------------------------*/

	/**
	 * Adds the "Cut" menu item.
	 * @param menu - The Menu object to add the item to.
	 * @param event - The MouseEvent object.
	 */
	addCutImageMenuItem(menu: Menu, event: MouseEvent) {
		menu.addItem((item) => {
item.setTitle(t('contextMenu.cut'))
				.setIcon("scissors")
				.onClick(async () => {
					await this.cutImageAndLinkFromNote(event);
				});
		});
	}

	/**
	 * Cuts the image and its link from the note, copying the link to clipboard.
	 * @param event - The MouseEvent object.
	 */
	async cutImageAndLinkFromNote(event: MouseEvent) {
		const img = event.target as HTMLImageElement;
		const src = img.getAttribute("src");
		if (!src) return;

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) {
new Notice(t('contextMenu.notice.noActiveMarkdownViewFound'));
			return;
		}

		try {
			const { editor } = activeView;

			if (src.startsWith("data:image/")) {
				const found = await this.processBase64Image(
					editor,
					src,
					async (editor, lineNumber, line, fullMatch) => {
						await this.removeImageLinkFromEditor(
							editor,
							lineNumber,
							line,
							fullMatch,
							true
						);
					}
				);
				if (!found) {
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- Base64 is a proper technical term
new Notice(t('contextMenu.notice.failedToFindBase64ImageLink'));
				}
				return;
			}

			const imagePath =
				src.startsWith("http://") || src.startsWith("https://")
					? null
					: this.folderAndFilenameManagement.getImagePath(img);

			const isExternal = !imagePath;

			// Use the modified findImageMatches
			const matches = await this.findImageMatches(
				editor,
				imagePath,
				isExternal
			);

			if (matches.length === 0) {
new Notice(t('contextMenu.notice.failedToFindImageLink'));
				return;
			}

			const handleConfirmation = async () => {
				for (const match of matches) {
					await this.removeImageLinkFromEditor(
						editor,
						match.lineNumber,
						match.line,
						match.fullMatch,
						true
					);
				}
new Notice(t('contextMenu.notice.imageLinksCutFromNote'));
			};

		if (matches.length > 1) {
				// Show confirmation modal
new ConfirmDialog(
					this.app,
					t('contextMenu.confirm.confirmCut'),
					t('contextMenu.confirm.confirmCutMessage', { count: String(matches.length) }),
					t('common.cut'),
					() => {
						handleConfirmation().catch((error: unknown) => {
							console.error("Failed to cut image links:", error);
new Notice(t('contextMenu.notice.failedToCut'));
						});
					}
				).open();
			} else {
				// Proceed directly if only one match
				await handleConfirmation();
			}
		} catch (error) {
			console.error("Error cutting image:", error);
new Notice(t('contextMenu.notice.failedToCutImage'));
		}
	}

	/*-----------------------------------------------------------------*/
	/*                          COPY IMAGE                             */
	/*-----------------------------------------------------------------*/

	/**
	 * Adds the "Copy image" menu item.
	 * @param menu - The Menu object to add the item to.
	 * @param event - The MouseEvent object.
	 */
	addCopyImageMenuItem(menu: Menu, event: MouseEvent) {
		menu.addItem((item: MenuItem) =>
			item
.setTitle(t('contextMenu.copyImage'))
				.setIcon("copy")
				.onClick(async () => {
					await this.copyImageToClipboard(event);
				})
		);
	}

	/**
	 * Copies the image to the clipboard.
	 * @param event - The MouseEvent object.
	 */
	async copyImageToClipboard(event: MouseEvent) {
		const img = new Image();
		img.crossOrigin = "anonymous";
		const targetImg = event.target as HTMLImageElement;

		// Use this.registerDomEvent() for proper cleanup
		this.registerDomEvent(img, "load", async () => {
			try {
				const canvas = document.createElement("canvas");
				canvas.width = img.naturalWidth;
				canvas.height = img.naturalHeight;
				const ctx = canvas.getContext("2d");
				if (!ctx) {
new Notice(t('contextMenu.notice.failedToGetCanvasContext'));
					return;
				}
				ctx.drawImage(img, 0, 0);
				const blob = await this.canvasToBlob(canvas);
				const item = new ClipboardItem({ [blob.type]: blob });
				await navigator.clipboard.write([item]);
new Notice(t('contextMenu.notice.imageCopiedToClipboard'));
			} catch (error) {
				console.error("Failed to copy image:", error);
new Notice(t('contextMenu.notice.failedToCopyImage'));
			}
		});

		img.src = targetImg.src;
	}

	/*-----------------------------------------------------------------*/
	/*                      COPY BASE64 IMAGE                          */
	/*-----------------------------------------------------------------*/

	/**
	 * Adds the "Copy as Base64 encoded image" menu item.
	 * @param menu - The Menu object to add the item to.
	 * @param event - The MouseEvent object.
	 */
	addCopyBase64ImageMenuItem(menu: Menu, event: MouseEvent) {
		menu.addItem((item: MenuItem) =>
			item
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- Base64 is a proper technical term
.setTitle(t('contextMenu.copyAsBase64'))
				.setIcon("copy")
				.onClick(() => {
					void this.copyImageAsBase64(event);
				})
		);
	}

	/**
	 * Copies the image as a Base64 encoded string to the clipboard.
	 * @param event - The MouseEvent object.
	 */
	async copyImageAsBase64(event: MouseEvent) {
		const targetImg = event.target as HTMLImageElement;
		const img = new Image();
		img.crossOrigin = "anonymous";

		this.registerDomEvent(img, "load", async () => {
			try {
				const canvas = document.createElement("canvas");
				canvas.width = img.naturalWidth;
				canvas.height = img.naturalHeight;
				const ctx = canvas.getContext("2d");
				if (!ctx) {
new Notice(t('contextMenu.notice.failedToGetCanvasContext'));
					return;
				}
				ctx.drawImage(img, 0, 0);
				const dataURL = canvas.toDataURL();
				await navigator.clipboard.writeText(`<img src="${dataURL}"/>`);
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- Base64 is a proper technical term
new Notice(t('contextMenu.notice.imageCopiedAsBase64'));
			} catch (error) {
				console.error("Failed to copy image as Base64:", error);
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- Base64 is a proper technical term
new Notice(t('contextMenu.notice.failedToCopyAsBase64'));
			}
		});

		img.src = targetImg.src;
	}

	/*-----------------------------------------------------------------*/
	/*                            Convert/Compress                     */
	/*-----------------------------------------------------------------*/

	/**
	 * Adds the "Convert/Compress" menu item.
	 *
	 * @param menu - The Menu object to add the item to.
	 * @param img - The HTMLImageElement representing the image.
	 * @param event - The MouseEvent representing the context menu event.
	 */
	addProcessImageMenuItem(
		menu: Menu,
		img: HTMLImageElement,
		event: MouseEvent
	) {
		menu.addItem((item) => {
item.setTitle(t('contextMenu.convertCompress'))
				.setIcon("cog")
				.onClick(async () => {
					try {
						// Ensure there is an active markdown view
						const activeView =
							this.app.workspace.getActiveViewOfType(
								MarkdownView
							);
					if (!activeView) {
new Notice(t('contextMenu.notice.noActiveMarkdownView'));
						return;
					}

					// Get the current note being viewed
					const currentFile = activeView.file;
					if (!currentFile) {
new Notice(t('contextMenu.notice.noCurrentFileFound'));
							return;
						}

						// Extract the filename from the img's src attribute
						const srcAttribute = img.getAttribute("src");
						if (!srcAttribute) {
new Notice(
								t('contextMenu.notice.noSourceAttribute')
							);
							return;
						}

						// Decode the filename from the src attribute
						const filename = decodeURIComponent(
							srcAttribute.split("?")[0].split("/").pop() || ""
						);
						if (!filename) {
new Notice(
								t('contextMenu.notice.unableToExtractFilename')
							);
							return;
						}

						// Search for matching files in the vault
						const matchingFiles = this.app.vault
							.getFiles()
							.filter((file) => file.name === filename);
						if (matchingFiles.length === 0) {
							console.error(
								"No matching files found for:",
								filename
							);
new Notice(t('contextMenu.notice.unableToFindImage', { filename }));
							return;
						}

						// If multiple matches, prefer files in the same folder as the current note
						const file =
							matchingFiles.length === 1
								? matchingFiles[0]
								: matchingFiles.find((fileItem) => {
										const parentPath =
											currentFile.parent?.path;
										return parentPath
											? fileItem.path.startsWith(
													parentPath
											  )
											: false;
								  }) || matchingFiles[0];

						// Process the found file
						if (file instanceof TFile) {
							new ProcessSingleImageModal(
								this.app,
								this.plugin,
								file
							).open();
					} else {
new Notice(t('contextMenu.notice.notValidImageFile'));
					}
					} catch (error) {
						console.error("Error processing image:", error);
new Notice(t('contextMenu.notice.errorProcessingImage'));
					}
				});
		});
	}

	/*-----------------------------------------------------------------*/
	/*                            CROP                                 */
	/*-----------------------------------------------------------------*/

	/**
	 * Adds the "Crop/Rotate/Flip" menu item.
	 * @param menu - The Menu object to add the item to.
	 * @param img - The HTMLImageElement that was right-clicked.
	 */
	addCropRotateFlipMenuItem(menu: Menu, img: HTMLImageElement) {
		menu.addItem((item) => {
item.setTitle(t('contextMenu.cropRotateFlip'))
				.setIcon("scissors")
				.onClick(async () => {
					// Get the active markdown view
					const activeView =
						this.app.workspace.getActiveViewOfType(MarkdownView);
					if (!activeView) {
new Notice(t('contextMenu.notice.noActiveMarkdownView'));
						return;
					}

					// Get the current file (note) being viewed
					const currentFile = activeView.file;
					if (!currentFile) {
new Notice(t('contextMenu.notice.noCurrentFileFound'));
						return;
					}

					// Get the filename from the src attribute
					const srcAttribute = img.getAttribute("src");
					if (!srcAttribute) {
new Notice(t('contextMenu.notice.noSourceAttribute'));
						return;
					}

					// Extract just the filename
					const filename = decodeURIComponent(
						srcAttribute.split("?")[0].split("/").pop() || ""
					);

					// Search for the file in the vault
					const matchingFiles = this.app.vault
						.getFiles()
						.filter((file) => file.name === filename);

					if (matchingFiles.length === 0) {
						console.error("No matching files found for:", filename);
new Notice(t('contextMenu.notice.unableToFindImage', { filename }));
						return;
					}

					// If multiple matches, try to find the one in the same folder as the current note
					const file =
						matchingFiles.length === 1
							? matchingFiles[0]
							: matchingFiles.find((fileItem) => {
									// Get the parent folder of the current file
									const parentPath = currentFile.parent?.path;
									return parentPath
										? fileItem.path.startsWith(parentPath)
										: false;
							  }) || matchingFiles[0];

					if (file instanceof TFile) {
						new Crop(this.app, file).open();
					} else {
new Notice(t('contextMenu.notice.unableToLocateImageFile'));
					}
				});
		});
	}

	/*-----------------------------------------------------------------*/
	/*                      Image Annotation                           */
	/*-----------------------------------------------------------------*/

	addAnnotateImageMenuItem(menu: Menu, img: HTMLImageElement) {
		menu.addItem((item) => {
item.setTitle(t('contextMenu.annotateImage'))
				.setIcon("pencil")
				.onClick(async () => {
					try {
						// Get the active markdown view
						const activeView =
						this.app.workspace.getActiveViewOfType(
							MarkdownView
						);
					if (!activeView) {
new Notice(t('contextMenu.notice.noActiveMarkdownView'));
						return;
					}

					// Get the current file (note) being viewed
					const currentFile = activeView.file;
					if (!currentFile) {
new Notice(t('contextMenu.notice.noCurrentFileFound'));
						return;
					}

					// Get the filename from the src attribute
					const srcAttribute = img.getAttribute("src");
					if (!srcAttribute) {
new Notice(t('contextMenu.notice.noSourceAttribute'));
							return;
						}

						// Extract just the filename
						const filename = decodeURIComponent(
							srcAttribute.split("?")[0].split("/").pop() || ""
						);
						// console.log('Extracted filename:', filename);

						// Search for the file in the vault
						const matchingFiles = this.app.vault
							.getFiles()
							.filter((file) => file.name === filename);

						if (matchingFiles.length === 0) {
							console.error(
								"No matching files found for:",
								filename
							);
new Notice(t('contextMenu.notice.unableToFindImage', { filename }));
							return;
						}

						// If multiple matches, try to find the one in the same folder as the current note
						const file =
							matchingFiles.length === 1
								? matchingFiles[0]
								: matchingFiles.find((fileItem) => {
										// Get the parent folder of the current file
										const parentPath =
											currentFile.parent?.path;
										return parentPath
											? fileItem.path.startsWith(
													parentPath
											  )
											: false;
								  }) || matchingFiles[0];

						if (file instanceof TFile) {
							// console.log('Found file:', file.path);
							new ImageAnnotationModal(
								this.app,
								this.plugin,
								file
							).open();
						} else {
new Notice(t('contextMenu.notice.unableToLocateImageFile'));
						}
					} catch (error) {
						console.error("Image location error:", error);
new Notice(t('contextMenu.notice.errorProcessingImagePath'));
					}
				});
		});
	}

	/*-----------------------------------------------------------------*/
	/*                      SHOW IN NAVIGATION                         */
	/*-----------------------------------------------------------------*/

	/**
	 * Adds the "Show in navigation" menu item.
	 * @param menu - The Menu object to add the item to.
	 * @param img - The HTMLImageElement whose file needs to be shown.
	 */
	addShowInNavigationMenuItem(menu: Menu, img: HTMLImageElement) {
		menu.addItem((item) => {
item.setTitle(t('contextMenu.showInNavigation'))
				.setIcon("folder-open")
				.onClick(async () => {
					await this.showImageInNavigation(img);
				});
		});
	}

	/**
	 * Shows the image file in the navigation pane.
	 * @param img - The HTMLImageElement whose file needs to be shown.
	 */
	async showImageInNavigation(img: HTMLImageElement) {
		try {
			const imagePath =
				this.folderAndFilenameManagement.getImagePath(img);
			if (imagePath) {
				const file = this.app.vault.getAbstractFileByPath(imagePath);
				if (file instanceof TFile) {
					// First, try to get existing file explorer
					let [fileExplorerLeaf] =
						this.app.workspace.getLeavesOfType("file-explorer");

					// If file explorer isn't open, create it
					if (!fileExplorerLeaf) {
						const newLeaf = this.app.workspace.getLeftLeaf(false);
						if (newLeaf) {
							await newLeaf.setViewState({
								type: "file-explorer",
							});
							fileExplorerLeaf = newLeaf;
						}
					}

					// Proceed only if we have a valid leaf
					if (fileExplorerLeaf) {
						// Ensure the left sidebar is expanded
						if (this.app.workspace.leftSplit) {
							this.app.workspace.leftSplit.expand();
						}

						// Now reveal the file using internal file explorer API
						const fileExplorerView = fileExplorerLeaf.view as FileExplorerView;
						fileExplorerView.revealInFolder?.(file);
					}
				}
			}
		} catch (error) {
new Notice(t('contextMenu.notice.failedToShowInNavigation'));
			console.error(error);
		}
	}

	/*-----------------------------------------------------------------*/
	/*                  SHOW IN SYSTEM EXPLORER                        */
	/*-----------------------------------------------------------------*/
	/**
	 * Adds the "Show in system explorer" menu item.
	 * @param menu - The Menu object to add the item to.
	 * @param img - The HTMLImageElement whose file needs to be shown in the system explorer.
	 */
	addShowInSystemExplorerMenuItem(menu: Menu, img: HTMLImageElement) {
		menu.addItem((item) => {
item.setTitle(t('contextMenu.showInSystemExplorer'))
				.setIcon("arrow-up-right")
				.onClick(async () => {
					await this.showImageInSystemExplorer(img);
				});
		});
	}

	/**
	 * Shows the image file in the system explorer.
	 * @param img - The HTMLImageElement whose file needs to be shown in the system explorer.
	 */
	async showImageInSystemExplorer(img: HTMLImageElement) {
		try {
			const imagePath =
				this.folderAndFilenameManagement.getImagePath(img);
			if (imagePath) {
				// Use the Obsidian API to reveal the file in the system explorer
				await this.app.showInFolder(imagePath);
			}
		} catch (error) {
new Notice(t('contextMenu.notice.failedToShowInExplorer'));
			console.error(error);
		}
	}

	/*-----------------------------------------------------------------*/
	/*                  DELETE IMAGE AND LINK                          */
	/*-----------------------------------------------------------------*/

	/**
	 * Adds the "Delete Image and Link" menu item.
	 * @param menu - The Menu object to add the item to.
	 * @param event - The MouseEvent object.
	 */
	addDeleteImageAndLinkMenuItem(menu: Menu, event: MouseEvent) {
		menu.addItem((item) => {
item.setTitle(t('contextMenu.deleteImageAndLink'))
				.setIcon("trash")
				.onClick(async () => {
					await this.deleteImageAndLinkFromNote(event);
				});
		});
	}

	/**
	 * Deletes both the image file and its link from the note.
	 * @param event - The MouseEvent object.
	 */
	async deleteImageAndLinkFromNote(event: MouseEvent) {
		const img = event.target as HTMLImageElement;
		const src = img.getAttribute("src");
		if (!src) return;

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) {
new Notice(t('contextMenu.notice.noActiveMarkdownViewFound'));
			return;
		}

		try {
			const { editor } = activeView;

			if (src.startsWith("data:image/")) {
				const found = await this.processBase64Image(
					editor,
					src,
					async (editor, lineNumber, line, fullMatch) => {
						await this.removeImageLinkFromEditor(
							editor,
							lineNumber,
							line,
							fullMatch,
							false
						);
					}
				);
			if (!found) {
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- Base64 is a proper technical term
new Notice(t('contextMenu.notice.failedToFindBase64ImageLink'));
			}
				return;
			}

			const imagePath =
				src.startsWith("http://") || src.startsWith("https://")
					? null
					: this.folderAndFilenameManagement.getImagePath(img);

			const isExternal = !imagePath;
			const matches = await this.findImageMatches(
				editor,
				imagePath,
				isExternal
			);

			if (matches.length === 0) {
new Notice(t('contextMenu.notice.failedToFindImageLink'));
				return;
			}

			// Identify unique matches based on line number, line content, and full match
			const uniqueMatchesMap: Map<string, ImageMatch> = new Map();
			for (const match of matches) {
				const key = `${match.lineNumber}-${match.line}-${match.fullMatch}`; // Create a unique key
				if (!uniqueMatchesMap.has(key)) {
					uniqueMatchesMap.set(key, match); // Add to map if not already present
				}
			}
			const uniqueMatches: ImageMatch[] = Array.from(
				uniqueMatchesMap.values()
			);

			if (uniqueMatches.length === 0) {
				new Notice(
					"Failed to find unique image links in the current note."
				); // Should not happen ideally as 'matches.length > 0' check is before, but good to have.
				return;
			}

			const handleConfirmation = async () => {
				// Sort matches by line number in descending order to handle deletions from bottom to top
				// This prevents line number shifting from affecting subsequent deletions
				const sortedMatches = uniqueMatches.sort(
					(matchA, matchB) => matchB.lineNumber - matchA.lineNumber
				);

				for (const match of sortedMatches) {
					await this.removeImageLinkFromEditor(
						editor,
						match.lineNumber,
						match.line,
						match.fullMatch,
						false
					);
				}

new Notice(t('contextMenu.notice.imageLinksRemovedFromNote'));

				// Delete the actual image file if it exists in the vault
				if (imagePath) {
					const imageFile =
						this.app.vault.getAbstractFileByPath(imagePath);
					if (imageFile instanceof TFile) {
						// Use FileManager.trashFile instead of direct deletion so that Obsidian's
						// file deletion settings are honored (e.g., "Move to system trash" vs
						// "Permanently delete").
						await this.app.fileManager.trashFile(imageFile);
new Notice(t('contextMenu.notice.imageFileMovedToTrash'));
					}
				}
			};

			// Show info in confirmation MODAL if more than 1 UNIQUE image were found
			if (uniqueMatches.length > 1) {
				// Create a DocumentFragment for the details
				const detailsFragment = document.createDocumentFragment();

				// Create a container div for the message within the fragment
				const messageContainer = document.createElement("div");
				detailsFragment.appendChild(messageContainer);

				// Add introductory text
				const introText = document.createElement("p");
introText.textContent = t('contextMenu.confirm.confirmDeleteMessage', { count: String(uniqueMatches.length) });
				messageContainer.appendChild(introText);

				// Add details to the message container
				uniqueMatches.forEach((match, index) => {
					// Iterate over uniqueMatches
					const lineNumber = match.lineNumber + 1;
					const lineContent = match.line.trim();
					const detailDiv = document.createElement("div");
					detailDiv.addClass("image-converter-confirm-detail");
					detailDiv.createSpan({ text: `  ${index + 1}. Line ${lineNumber}: ${lineContent}` });
					messageContainer.appendChild(detailDiv); // Append to messageContainer
				});

new ConfirmDialog(
					this.app,
					t('contextMenu.confirm.confirmDelete'),
					detailsFragment,
					t('common.delete'),
					() => {
						handleConfirmation().catch((error: unknown) => {
							console.error("Failed to delete image:", error);
new Notice(t('contextMenu.notice.failedToDelete'));
						});
					}
				).open();
			} else if (uniqueMatches.length === 1) {
				// if only 1 unique match, proceed directly without confirmation for multiple
				await handleConfirmation();
			} else {
				// This case should not happen because of the initial check `if (uniqueMatches.length === 0)` but for completeness.
new Notice(t('contextMenu.notice.noUniqueImageLinksFound'));
			}
		} catch (error) {
			console.error("Error deleting image:", error);
new Notice(t('contextMenu.notice.failedToDelete'));
		}
	}

	/*-----------------------------------------------------------------*/
	/*                         ZOOM IMAGE                              */
	/*-----------------------------------------------------------------*/

	/**
	 * 添加"缩放图片"子菜单项，提供多个缩放百分比选项。
	 * 点击后将 markdown 图片链接替换为 <img style="zoom:XX%;" /> 格式的 HTML 标签。
	 */
	addZoomImageMenuItem(menu: Menu, img: HTMLImageElement, activeFile: TFile) {
		const zoomPercentages = [25, 33, 50, 67, 75, 100];

		menu.addItem((item) => {
			const submenu = item
				.setTitle(t('contextMenu.zoom.title'))
				.setIcon("maximize")
				.setSubmenu();

			for (const pct of zoomPercentages) {
				submenu.addItem((subItem) => {
					subItem
						.setTitle(`${pct}%`)
						.onClick(async () => {
							await this.applyZoomToImage(img, activeFile, pct);
						});
				});
			}

			submenu.addSeparator();

			// 重置为标准 Markdown 格式
			submenu.addItem((subItem) => {
				subItem
					.setTitle(t('contextMenu.zoom.resetToMarkdown'))
					.setIcon("rotate-ccw")
					.onClick(async () => {
						await this.resetZoomToMarkdown(img, activeFile);
					});
			});
		});
	}

	/**
	 * 将图片链接替换为 <img src="..." alt="..." style="zoom:XX%;" /> 格式
	 */
	private async applyZoomToImage(img: HTMLImageElement, activeFile: TFile, zoomPercent: number) {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) {
			new Notice(t('contextMenu.notice.noActiveMarkdownView'));
			return;
		}

		const { editor } = activeView;
		const imagePath = this.getImagePathSafe(img);
		const isExternal = !imagePath;
		const matches = await this.findImageMatches(editor, imagePath, isExternal);

		if (matches.length === 0) {
			new Notice(t('contextMenu.notice.failedToFindImageLink'));
			return;
		}

		// 去重：同一行同一 fullMatch 只保留一次
		const seen = new Set<string>();
		const uniqueMatches = matches.filter(m => {
			const key = `${m.lineNumber}:${m.fullMatch}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});

		// 从后向前替换，避免前面的替换导致后续行偏移
		for (let idx = uniqueMatches.length - 1; idx >= 0; idx--) {
			const { lineNumber, fullMatch } = uniqueMatches[idx];
			// 每次替换前重新读取当前行内容，确保位置准确
			const currentLine = editor.getLine(lineNumber);

			// 从链接中提取路径和 alt 文本
			let src = "";
			let alt = "";

			// 尝试匹配已有的 <img> 标签（不强制要求 alt 属性存在）
			const imgTagMatch = fullMatch.match(/<img\s+[^>]*src="([^"]*)"[^>]*\/?>/);
			if (imgTagMatch) {
				src = imgTagMatch[1];
				// 单独提取 alt 属性（可能不存在）
				const altMatch = fullMatch.match(/alt="([^"]*)"/);
				alt = altMatch ? altMatch[1] : path.parse(src).name;
			} else {
				// Wiki-style: ![[path|caption|dimensions]]
				const wikiMatch = fullMatch.match(/!\[\[\s*([^|\]]+?)(?:\|([^|\]]+?))?(?:\|[^|\]]+?)?\s*\]\]/);
				if (wikiMatch) {
					src = wikiMatch[1].trim();
					alt = wikiMatch[2]?.trim() || path.parse(src).name;
				} else {
					// Markdown-style: ![alt|dimensions](path)
					const mdMatch = fullMatch.match(/!\[([^|\]]*?)(?:\|[^\]]+?)?\]\(([^)]+)\)/);
					if (mdMatch) {
						alt = mdMatch[1].trim() || path.parse(mdMatch[2]).name;
						src = mdMatch[2].trim();
					}
				}
			}

			if (!src) continue;

			// 构建新的 <img> 标签
			const newTag = `<img src="${src}" alt="${alt}" style="zoom:${zoomPercent}%;" />`;

			// 替换原文本（使用当前行内容查找位置）
			const startCh = currentLine.indexOf(fullMatch);
			if (startCh === -1) continue;

			const startPos = { line: lineNumber, ch: startCh };
			const endPos = { line: lineNumber, ch: startCh + fullMatch.length };
			editor.replaceRange(newTag, startPos, endPos);
		}
	}

	/**
	 * 将 <img> 标签重置为标准 Markdown 格式 ![alt](src)
	 */
	private async resetZoomToMarkdown(img: HTMLImageElement, activeFile: TFile) {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) {
			new Notice(t('contextMenu.notice.noActiveMarkdownView'));
			return;
		}

		const { editor } = activeView;
		const src = img.getAttribute("src");
		if (!src) return;

		const lineCount = editor.getDoc().lineCount();

		for (let i = 0; i < lineCount; i++) {
			const line = editor.getLine(i);

			// 匹配 <img> 标签（不强制要求 alt 属性存在）
			const imgTagRegex = /<img\s+[^>]*src="([^"]*)"[^>]*\/?>/g;
			let tagMatch;

			while ((tagMatch = imgTagRegex.exec(line)) !== null) {
				const tagSrc = tagMatch[1];
				// 单独提取 alt 属性（可能不存在）
				const altMatch = tagMatch[0].match(/alt="([^"]*)"/);
				const tagAlt = altMatch ? altMatch[1] : path.parse(tagSrc).name;

				// 比较路径
				const normalizedSrc = this.normalizeImagePath(src);
				const normalizedTagSrc = this.normalizeImagePath(tagSrc);

				if (normalizedSrc === normalizedTagSrc || normalizedSrc.endsWith(normalizedTagSrc)) {
					const mdLink = `![${tagAlt}](${tagSrc})`;
					const startPos = { line: i, ch: tagMatch.index };
					const endPos = { line: i, ch: tagMatch.index + tagMatch[0].length };
					editor.replaceRange(mdLink, startPos, endPos);
					return; // 只替换第一个匹配
				}
			}
		}
	}

	/*-----------------------------------------------------------------*/
	/*                      FIGURE CAPTION                             */
	/*-----------------------------------------------------------------*/

	/**
	 * 添加"添加图片标题"菜单项。
	 * 点击后弹出对话框，用户输入 Figure ID 和标题文本，
	 * 然后将图片链接替换为 <figure>/<figcaption> HTML 结构。
	 */
	addFigureCaptionMenuItem(menu: Menu, img: HTMLImageElement, activeFile: TFile) {
		menu.addItem((item) => {
			item
				.setTitle(t('contextMenu.addFigureCaption'))
				.setIcon("text-cursor-input")
				.onClick(async () => {
					await this.showFigureCaptionDialog(img, activeFile);
				});
		});
	}

	/**
	 * 显示 Figure Caption 对话框
	 */
	private async showFigureCaptionDialog(img: HTMLImageElement, activeFile: TFile) {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) {
			new Notice(t('contextMenu.notice.noActiveMarkdownView'));
			return;
		}

		const { editor } = activeView;
		const imagePath = this.getImagePathSafe(img);
		const isExternal = !imagePath;
		const matches = await this.findImageMatches(editor, imagePath, isExternal);

		// 也检查是否已经是 <figure> 结构或 <img> 标签
		let existingFigureInfo: { lineStart: number; lineEnd: number; src: string; alt: string; figId: string; caption: string; zoom: string } | null = null;

		const src = img.getAttribute("src");
		if (src) {
			const lineCount = editor.getDoc().lineCount();
			for (let i = 0; i < lineCount; i++) {
				const line = editor.getLine(i);
				if (line.includes("<figure") && line.includes("text-align:center")) {
					// 检查多行 figure 结构
					let figureBlock = line;
					let endLine = i;
					for (let j = i; j < Math.min(i + 5, lineCount); j++) {
						figureBlock += "\n" + editor.getLine(j);
						if (editor.getLine(j).includes("</figure>")) {
							endLine = j;
							break;
						}
					}

					const figSrcMatch = figureBlock.match(/src="([^"]*)"/);
					const figAltMatch = figureBlock.match(/alt="([^"]*)"/);
					const figIdMatch = figureBlock.match(/id="([^"]*)"/);
					const figCaptionMatch = figureBlock.match(/<figcaption>(.*?)<\/figcaption>/);
					const figZoomMatch = figureBlock.match(/zoom:(\d+)%/);

					if (figSrcMatch) {
						const normalizedSrc = this.normalizeImagePath(src);
						const normalizedFigSrc = this.normalizeImagePath(figSrcMatch[1]);

						if (normalizedSrc === normalizedFigSrc || normalizedSrc.endsWith(normalizedFigSrc)) {
							existingFigureInfo = {
								lineStart: i,
								lineEnd: endLine,
								src: figSrcMatch[1],
								alt: figAltMatch?.[1] || "",
								figId: figIdMatch?.[1] || "",
								caption: figCaptionMatch?.[1] || "",
								zoom: figZoomMatch?.[1] || "67",
							};
							break;
						}
					}
				}
			}
		}

		// 使用 Obsidian Modal 创建对话框
		const modal = new FigureCaptionModal(
			this.app,
			existingFigureInfo?.figId || "",
			existingFigureInfo?.caption || "",
			existingFigureInfo?.zoom || "67",
			!!existingFigureInfo,
			async (figId: string, caption: string, zoom: string, shouldRemove: boolean) => {
				if (shouldRemove && existingFigureInfo) {
					// 移除 figure，恢复为 Markdown
					const mdLink = `![${existingFigureInfo.alt}](${existingFigureInfo.src})`;
					const startPos = { line: existingFigureInfo.lineStart, ch: 0 };
					const endPos = { line: existingFigureInfo.lineEnd, ch: editor.getLine(existingFigureInfo.lineEnd).length };
					editor.replaceRange(mdLink, startPos, endPos);
					return;
				}

				if (existingFigureInfo) {
					// 更新已有的 figure
					const figureHtml = this.buildFigureHtml(existingFigureInfo.src, existingFigureInfo.alt, figId, caption, zoom);
					const startPos = { line: existingFigureInfo.lineStart, ch: 0 };
					const endPos = { line: existingFigureInfo.lineEnd, ch: editor.getLine(existingFigureInfo.lineEnd).length };
					editor.replaceRange(figureHtml, startPos, endPos);
				} else if (matches.length > 0) {
					// 从 Markdown/Wiki 链接转换为 figure
					const match = matches[0];
					let imgSrc = "";
					let imgAlt = "";

					// 尝试匹配 <img> 标签（不强制要求 alt 属性存在）
					const imgTagMatch = match.fullMatch.match(/<img\s+[^>]*src="([^"]*)"[^>]*\/?>/);
					if (imgTagMatch) {
						imgSrc = imgTagMatch[1];
						const altMatch = match.fullMatch.match(/alt="([^"]*)"/);
						imgAlt = altMatch ? altMatch[1] : path.parse(imgSrc).name;
					} else {
						const wikiMatch = match.fullMatch.match(/!\[\[\s*([^|\]]+?)(?:\|([^|\]]+?))?(?:\|[^|\]]+?)?\s*\]\]/);
						if (wikiMatch) {
							imgSrc = wikiMatch[1].trim();
							imgAlt = wikiMatch[2]?.trim() || path.parse(imgSrc).name;
						} else {
							const mdMatch = match.fullMatch.match(/!\[([^|\]]*?)(?:\|[^\]]+?)?\]\(([^)]+)\)/);
							if (mdMatch) {
								imgAlt = mdMatch[1].trim() || path.parse(mdMatch[2]).name;
								imgSrc = mdMatch[2].trim();
							}
						}
					}

					if (!imgSrc) return;

					const figureHtml = this.buildFigureHtml(imgSrc, imgAlt, figId, caption, zoom);
					const startCh = match.line.indexOf(match.fullMatch);
					if (startCh === -1) return;

					const startPos = { line: match.lineNumber, ch: startCh };
					const endPos = { line: match.lineNumber, ch: startCh + match.fullMatch.length };
					editor.replaceRange(figureHtml, startPos, endPos);
				}
			}
		);
		modal.open();
	}

	/**
	 * 构建 <figure> HTML 块
	 */
	private buildFigureHtml(src: string, alt: string, figId: string, caption: string, zoom: string): string {
		const zoomStyle = zoom ? `zoom:${zoom}%; ` : "";
		const nameAttr = figId ? ` name="${figId}"` : "";
		const idAttr = figId ? ` id="${figId}"` : "";
		const captionText = figId && caption ? `${figId} - ${caption}` : caption || figId || "";

		return `<figure style="text-align:center;">\n  <img src="${src}" alt="${alt}" style="${zoomStyle}display:block; margin:auto;"${nameAttr}${idAttr}>\n  <figcaption>${captionText}</figcaption>\n</figure>`;
	}

	onunload() {
		super.onunload(); // Important! Calls Component's cleanup
		if (this.currentMenu) {
			this.hideMenu(this.currentMenu);
			this.currentMenu = null;
		}
		this.contextMenuRegistered = false;
	}
}

/**
 * Figure 引用项（用于 Suggest Modal 列表）
 */
interface FigureReferenceItem {
	id: string;
	caption: string;
	line: number;
}

/**
 * Figure 引用选择对话框
 * 扫描当前笔记中所有带 ID 的 <figure> 块，弹出列表供用户选择并插入锚点引用。
 */
export class FigureReferenceSuggestModal extends Modal {
	private items: FigureReferenceItem[];
	private editor: Editor;
	private listContainer: HTMLElement;
	private searchInput: HTMLInputElement;

	constructor(app: App, items: FigureReferenceItem[], editor: Editor) {
		super(app);
		this.items = items;
		this.editor = editor;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("image-converter-figure-ref-modal");

		contentEl.createEl("h3", { text: t('figureRef.insertReference') });

		// 搜索框
		this.searchInput = contentEl.createEl("input", {
			type: "text",
			placeholder: t('figureRef.searchPlaceholder'),
			cls: "image-converter-figure-ref-search",
		});
		this.searchInput.focus();

		this.listContainer = contentEl.createDiv("image-converter-figure-ref-list");

		this.renderList(this.items);

		// 搜索过滤
		this.searchInput.addEventListener("input", () => {
			const query = this.searchInput.value.toLowerCase();
			const filtered = this.items.filter(
				(item) =>
					item.id.toLowerCase().includes(query) ||
					item.caption.toLowerCase().includes(query)
			);
			this.renderList(filtered);
		});

		// 键盘 Enter 选中第一个
		this.searchInput.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				const firstBtn = this.listContainer.querySelector(".image-converter-figure-ref-item") as HTMLElement | null;
				firstBtn?.click();
			}
		});
	}

	private renderList(items: FigureReferenceItem[]) {
		this.listContainer.empty();

		if (items.length === 0) {
			this.listContainer.createEl("div", {
				text: t('figureRef.noFiguresFound'),
				cls: "image-converter-figure-ref-empty",
			});
			return;
		}

		for (const item of items) {
			const row = this.listContainer.createDiv("image-converter-figure-ref-item");
			const idSpan = row.createSpan({ text: item.id, cls: "image-converter-figure-ref-id" });
			if (item.caption) {
				row.createSpan({ text: ` — ${item.caption}`, cls: "image-converter-figure-ref-caption" });
			}
			row.createSpan({ text: ` (L${item.line + 1})`, cls: "image-converter-figure-ref-line" });

			row.addEventListener("click", () => {
				const ref = `[${item.id}](#${item.id})`;
				this.editor.replaceSelection(ref);
				new Notice(t('figureRef.notice.referenceInserted'));
				this.close();
			});
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * 扫描编辑器中所有带 id 的 <figure> 块，返回 FigureReferenceItem 列表。
 */
export function scanFigureIds(editor: Editor): FigureReferenceItem[] {
	const results: FigureReferenceItem[] = [];
	const lineCount = editor.getDoc().lineCount();

	for (let i = 0; i < lineCount; i++) {
		const line = editor.getLine(i);

		// 匹配 <img ... id="xxx"> 或 <figure ... id="xxx">
		const idMatches = [...line.matchAll(/id="([^"]+)"/g)];
		for (const m of idMatches) {
			const figId = m[1];
			if (!figId) continue;

			// 尝试提取 figcaption 文本（可能在同一行或后续行）
			let caption = "";
			const captionMatch = line.match(/<figcaption>(.*?)<\/figcaption>/);
			if (captionMatch) {
				caption = captionMatch[1];
			} else {
				// 查看后续几行
				for (let j = i + 1; j < Math.min(i + 5, lineCount); j++) {
					const nextLine = editor.getLine(j);
					const nextCaptionMatch = nextLine.match(/<figcaption>(.*?)<\/figcaption>/);
					if (nextCaptionMatch) {
						caption = nextCaptionMatch[1];
						break;
					}
					if (nextLine.includes("</figure>")) break;
				}
			}

			// 避免重复添加同一 ID
			if (!results.some((r) => r.id === figId)) {
				results.push({ id: figId, caption, line: i });
			}
		}
	}

	return results;
}

/**
 * Figure Caption 输入对话框
 */
class FigureCaptionModal extends Modal {
	private figId: string;
	private caption: string;
	private zoom: string;
	private isExisting: boolean;
	private onSubmit: (figId: string, caption: string, zoom: string, shouldRemove: boolean) => Promise<void>;

	constructor(
		app: App,
		figId: string,
		caption: string,
		zoom: string,
		isExisting: boolean,
		onSubmit: (figId: string, caption: string, zoom: string, shouldRemove: boolean) => Promise<void>
	) {
		super(app);
		this.figId = figId;
		this.caption = caption;
		this.zoom = zoom;
		this.isExisting = isExisting;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("image-converter-figure-modal");

		contentEl.createEl("h3", { text: t('contextMenu.figure.title') });

		// Figure ID 输入
		new Setting(contentEl)
			.setName(t('contextMenu.figure.idLabel'))
			.addText((text) => {
				text.setPlaceholder(t('contextMenu.figure.idPlaceholder'))
					.setValue(this.figId)
					.onChange((value) => {
						this.figId = value;
					});
			});

		// Caption 输入
		new Setting(contentEl)
			.setName(t('contextMenu.figure.captionLabel'))
			.addText((text) => {
				text.setPlaceholder(t('contextMenu.figure.captionPlaceholder'))
					.setValue(this.caption)
					.onChange((value) => {
						this.caption = value;
					});
			});

		// Zoom 输入
		new Setting(contentEl)
			.setName(t('contextMenu.zoom.title'))
			.addDropdown((dropdown) => {
				const zoomOptions = ["25", "33", "50", "67", "75", "100"];
				for (const opt of zoomOptions) {
					dropdown.addOption(opt, `${opt}%`);
				}
				dropdown.setValue(this.zoom || "67");
				dropdown.onChange((value) => {
					this.zoom = value;
				});
			});

		// 按钮区域
		const buttonContainer = contentEl.createDiv("image-converter-figure-buttons");

		if (this.isExisting) {
			// 移除 figure caption 按钮
			new Setting(buttonContainer)
				.addButton((btn) => {
					btn.setButtonText(t('contextMenu.figure.removeCaption'))
						.onClick(async () => {
							await this.onSubmit("", "", "", true);
							this.close();
						});
				})
				.addButton((btn) => {
					btn.setButtonText(t('common.apply'))
						.setCta()
						.onClick(async () => {
							await this.onSubmit(this.figId, this.caption, this.zoom, false);
							this.close();
						});
				});
		} else {
			new Setting(buttonContainer)
				.addButton((btn) => {
					btn.setButtonText(t('common.cancel'))
						.onClick(() => {
							this.close();
						});
				})
				.addButton((btn) => {
					btn.setButtonText(t('common.apply'))
						.setCta()
						.onClick(async () => {
							await this.onSubmit(this.figId, this.caption, this.zoom, false);
							this.close();
						});
				});
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
