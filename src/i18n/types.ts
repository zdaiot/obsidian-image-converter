/**
 * i18n 国际化类型定义
 * 所有 UI 文本字符串的键值类型
 */
export interface TranslationStrings {
    // ==================== 通用 ====================
    'common.confirm': string;
    'common.cancel': string;
    'common.apply': string;
    'common.delete': string;
    'common.error': string;
    'common.success': string;
    'common.warning': string;
    'common.none': string;
    'common.process': string;
    'common.preview': string;
    'common.cut': string;
    'common.close': string;

    // ==================== 右键菜单 ====================
    'contextMenu.openInNewWindow': string;
    'contextMenu.cut': string;
    'contextMenu.copyImage': string;
    'contextMenu.copyAsBase64': string;
    'contextMenu.convertCompress': string;
    'contextMenu.cropRotateFlip': string;
    'contextMenu.annotateImage': string;
    'contextMenu.showInNavigation': string;
    'contextMenu.showInSystemExplorer': string;
    'contextMenu.deleteImageAndLink': string;
    'contextMenu.zoomImage': string;
    'contextMenu.addFigureCaption': string;

    // 右键菜单 - 输入字段标签
    'contextMenu.nameLabel': string;
    'contextMenu.folderLabel': string;
    'contextMenu.captionLabel': string;
    'contextMenu.sizeLabel': string;
    'contextMenu.namePlaceholder': string;
    'contextMenu.folderPlaceholder': string;
    'contextMenu.captionPlaceholder': string;
    'contextMenu.captionLoading': string;

    // 右键菜单 - 提示消息
    'contextMenu.notice.dimensionsMustBePositive': string;
    'contextMenu.notice.failedToFindImageLink': string;
    'contextMenu.notice.captionAndDimensionsUpdated': string;
    'contextMenu.notice.failedToUpdate': string;
    'contextMenu.notice.pleaseEnterNewName': string;
    'contextMenu.notice.pleaseEnterValidName': string;
    'contextMenu.notice.pleaseEnterNewPath': string;
    'contextMenu.notice.imageNameUpdated': string;
    'contextMenu.notice.imagePathUpdated': string;
    'contextMenu.notice.imagePathUpdatedCaseSensitive': string;
    'contextMenu.notice.imagePathUpdateFailedCaseSensitive': string;
    'contextMenu.notice.failedToUpdateImagePath': string;
    'contextMenu.notice.failedToOpenInNewWindow': string;
    'contextMenu.notice.noActiveMarkdownView': string;
    'contextMenu.notice.failedToFindBase64ImageLink': string;
    'contextMenu.notice.imageLinksCutFromNote': string;
    'contextMenu.notice.failedToCut': string;
    'contextMenu.notice.failedToCutImage': string;
    'contextMenu.notice.failedToGetCanvasContext': string;
    'contextMenu.notice.imageCopiedToClipboard': string;
    'contextMenu.notice.failedToCopyImage': string;
    'contextMenu.notice.imageCopiedAsBase64': string;
    'contextMenu.notice.failedToCopyAsBase64': string;
    'contextMenu.notice.noCurrentFileFound': string;
    'contextMenu.notice.noSourceAttribute': string;
    'contextMenu.notice.unableToFindImage': string;
    'contextMenu.notice.notValidImageFile': string;
    'contextMenu.notice.errorProcessingImage': string;
    'contextMenu.notice.unableToLocateImageFile': string;
    'contextMenu.notice.errorProcessingImagePath': string;
    'contextMenu.notice.failedToShowInNavigation': string;
    'contextMenu.notice.failedToShowInExplorer': string;
    'contextMenu.notice.noActiveMarkdownViewFound': string;
    'contextMenu.notice.imageLinksRemovedFromNote': string;
    'contextMenu.notice.imageFileMovedToTrash': string;
    'contextMenu.notice.noUniqueImageLinksFound': string;
    'contextMenu.notice.failedToDelete': string;
    'contextMenu.notice.unableToExtractFilename': string;

    // 右键菜单 - 确认对话框
    'contextMenu.confirm.confirmUpdates': string;
    'contextMenu.confirm.foundMatchingLinks': string;
    'contextMenu.confirm.update': string;
    'contextMenu.confirm.confirmCut': string;
    'contextMenu.confirm.confirmCutMessage': string;
    'contextMenu.confirm.confirmDelete': string;
    'contextMenu.confirm.confirmDeleteMessage': string;

    // 右键菜单 - 缩放选项
    'contextMenu.zoom.title': string;
    'contextMenu.zoom.resetToMarkdown': string;

    // 右键菜单 - Figure 标题
    'contextMenu.figure.title': string;
    'contextMenu.figure.idLabel': string;
    'contextMenu.figure.idPlaceholder': string;
    'contextMenu.figure.captionLabel': string;
    'contextMenu.figure.captionPlaceholder': string;
    'contextMenu.figure.removeCaption': string;

    // ==================== 图片对齐 ====================
    'alignment.alignImage': string;
    'alignment.left': string;
    'alignment.center': string;
    'alignment.right': string;
    'alignment.wrapText': string;

    // ==================== main.ts ====================
    'main.notice.failedToInitialize': string;
    'main.notice.noActiveFileDetected': string;
    'main.notice.unableToOpenSettings': string;
    'main.notice.reloadingPlugin': string;
    'main.notice.failedToReload': string;
    'main.notice.pluginReloaded': string;
    'main.notice.failedToReloadSeeConsole': string;
    'main.notice.failedToDetermineDestination': string;
    'main.notice.failedToCreateFolder': string;
    'main.notice.errorIncrementingFilename': string;
    'main.notice.failedToInsertLink': string;
    'main.notice.skippedConversion': string;
    'main.notice.usingOriginalImage': string;
    'main.notice.failedToProcessFileExists': string;
    'main.notice.failedToProcessInvalidType': string;
    'main.notice.failedToProcessImage': string;
    'main.notice.unexpectedError': string;
    'main.notice.failedToInsertImageLink': string;
    'main.notice.gifDownloadFailed': string;

    // main.ts - 菜单项
    'main.menu.processImage': string;
    'main.menu.processAllInFolder': string;
    'main.menu.processAllInNote': string;
    'main.menu.processAllInCanvas': string;

    // ==================== 预设选择模态框 ====================
    'presetModal.title': string;
    'presetModal.variables': string;
    'presetModal.showVariables': string;
    'presetModal.folder': string;
    'presetModal.folderPlaceholder': string;
    'presetModal.filename': string;
    'presetModal.filenamePlaceholder': string;
    'presetModal.format': string;
    'presetModal.link': string;
    'presetModal.resize': string;
    'presetModal.quality': string;
    'presetModal.preview': string;
    'presetModal.noPathSpecified': string;
    'presetModal.enterTemplatesToPreview': string;
    'presetModal.errorGeneratingPreview': string;
    'presetModal.editPresets': string;

    // ==================== 批量处理 ====================
    'batch.notice.noImagesFound': string;
    'batch.notice.noProcessingNeeded': string;
    'batch.notice.noProcessingNeededFormat': string;
    'batch.notice.noProcessingNeededOriginal': string;
    'batch.notice.noProcessingNeededAllFormat': string;
    'batch.notice.noImagesNeedProcessing': string;
    'batch.notice.failedToUpdateLinks': string;
    'batch.notice.errorProcessingImage': string;
    'batch.notice.errorProcessingImages': string;
    'batch.notice.errorInvalidFolder': string;
    'batch.notice.noImagesFoundInFolder': string;
    'batch.notice.noImagesFoundInVault': string;
    'batch.notice.noProcessingNeededVault': string;
    'batch.notice.noProcessingNeededVaultFormat': string;
    'batch.notice.noProcessingNeededVaultAll': string;

    // ==================== 处理文件夹模态框 ====================
    'folderModal.title': string;
    'folderModal.subtitle': string;
    'folderModal.warning': string;
    'folderModal.totalImages': string;
    'folderModal.toBeSkipped': string;
    'folderModal.toBeProcessed': string;
    'folderModal.imageSource': string;
    'folderModal.general': string;
    'folderModal.skip': string;
    'folderModal.resize': string;
    'folderModal.processButton': string;
    'folderModal.errorInvalidFolder': string;

    // ==================== 处理全部 Vault 模态框 ====================
    'vaultModal.title': string;
    'vaultModal.subtitle': string;
    'vaultModal.warning': string;
    'vaultModal.processButton': string;

    // ==================== 处理单个图片模态框 ====================
    'singleModal.notice.ffmpegNotFound': string;
    'singleModal.notice.ffmpegPathDetected': string;
    'singleModal.notice.ffmpegAutoDetectFailed': string;
    'singleModal.notice.pleaseSpecifyFfmpegPath': string;
    'singleModal.notice.workingEncoder': string;
    'singleModal.notice.encoderDetectionFailed': string;
    'singleModal.notice.noWorkingEncoder': string;
    'singleModal.notice.errorDetectingEncoder': string;
    'singleModal.notice.noProcessingNeeded': string;
    'singleModal.notice.skippedConversion': string;
    'singleModal.notice.usingOriginalImage': string;
    'singleModal.notice.couldNotFindRenamedFile': string;
    'singleModal.notice.linkUpdated': string;
    'singleModal.notice.imageProcessedButFailedRefresh': string;
    'singleModal.notice.imageProcessed': string;
    'singleModal.notice.failedToProcessImage': string;
    'singleModal.button.detectEncoder': string;
    'singleModal.button.validating': string;
    'singleModal.button.process': string;
    'singleModal.button.cancel': string;
    'singleModal.previewNotAvailable': string;
    'singleModal.generatingPreview': string;

    // ==================== 处理当前笔记 ====================
    'currentNote.notice.errorActiveMustBeMarkdown': string;

    // ==================== LinkFormatter ====================
    'linkFormatter.notice.failedToLoadDimensions': string;

    // ==================== 设置页面 ====================
    'settings.rightClickMenu': string;
    'settings.cursorPositionAfterDrop': string;
    'settings.neverProcessFilenames': string;
    'settings.showSizeNotification': string;
    'settings.showWindow': string;
    'settings.showWindowDesc': string;
    'settings.quicklyApplyPresets': string;
    'settings.defaultAlignmentForNew': string;
    'settings.defaultAlignmentForNewDesc': string;
    'settings.alignmentCacheLocation': string;
    'settings.alignmentCacheCleanup': string;
    'settings.enableDragResize': string;
    'settings.enableDragResizeDesc': string;
    'settings.lockAspectRatio': string;
    'settings.lockAspectRatioDesc': string;
    'settings.enableScrollResize': string;
    'settings.enableScrollResizeDesc': string;
    'settings.scrollModifierKey': string;
    'settings.scrollModifierKeyDesc': string;
    'settings.scrollSensitivity': string;
    'settings.scrollSensitivityDesc': string;
    'settings.cursorDuringResize': string;
    'settings.allowReadingModeResize': string;
    'settings.allowReadingModeResizeDesc': string;
    'settings.captionAlignment': string;
    'settings.captionTextTransform': string;
    'settings.captionTextTransformDesc': string;
    'settings.captionFontSize': string;
    'settings.captionFontSizeDesc': string;
    'settings.captionFontWeight': string;
    'settings.captionFontWeightDesc': string;
    'settings.captionColor': string;
    'settings.captionColorDesc': string;
    'settings.captionFontStyle': string;
    'settings.captionFontStyleDesc': string;
    'settings.captionBgColor': string;
    'settings.captionBgColorDesc': string;
    'settings.captionBorder': string;
    'settings.captionBorderDesc': string;
    'settings.notice.contextMenuDisabled': string;
    'settings.notice.contextMenuEnabled': string;
    'settings.notice.alignmentDisabled': string;
    'settings.notice.alignmentEnabled': string;
    'settings.notice.resizeDisabled': string;
    'settings.notice.resizeEnabled': string;
    'settings.notice.captionsDisabled': string;
    'settings.notice.captionsEnabled': string;
    'settings.notice.ffmpegNotFound': string;
    'settings.notice.ffmpegPathDetected': string;
    'settings.notice.ffmpegAutoDetectFailed': string;
    'settings.notice.pleaseSpecifyFfmpegPath': string;
    'settings.notice.workingEncoder': string;
    'settings.notice.encoderDetectionFailed': string;
    'settings.notice.noWorkingEncoder': string;
    'settings.notice.errorDetectingEncoder': string;
    'settings.notice.presetNameEmpty': string;
    'settings.notice.presetNameExists': string;
    'settings.notice.pleaseEnterPresetName': string;
    'settings.notice.invalidCustomValue': string;

    // 设置页面 - Caption 样式
    'settings.captionBorderRadius': string;
    'settings.captionBorderRadiusDesc': string;
    'settings.captionSpaceTop': string;
    'settings.captionSpaceTopDesc': string;
    'settings.captionPadding': string;
    'settings.captionPaddingDesc': string;
    'settings.skipCaptionExtensions': string;
    'settings.skipCaptionExtensionsDesc': string;

    // 设置页面 - 预设表单
    'settings.presetName': string;
    'settings.customImagename': string;
    'settings.ifOutputFileExists': string;
    'settings.ifOutputFileExistsDesc': string;
    'settings.reuseExistingFile': string;
    'settings.addNumberSuffix': string;
    'settings.location': string;
    'settings.inSubfolder': string;
    'settings.custom': string;
    'settings.defaultObsidianSetting': string;
    'settings.rootFolder': string;
    'settings.sameFolderAsNote': string;
    'settings.subfolderName': string;
    'settings.subfolderNameDesc': string;
    'settings.showAvailableVariables': string;
    'settings.preview': string;
    'settings.errorGeneratingPreview': string;
    'settings.customPath': string;
    'settings.customPathDesc': string;

    // 设置页面 - 输出格式
    'settings.outputFormat': string;
    'settings.outputFormatOriginal': string;
    'settings.outputFormatNone': string;
    'settings.quality': string;
    'settings.colorDepth': string;
    'settings.pngquantExecutablePath': string;
    'settings.pngquantExecutablePathTooltip': string;
    'settings.pngquantQualityRange': string;
    'settings.pngquantQualityRangeDesc': string;

    // 设置页面 - FFmpeg
    'settings.ffmpegExecutablePath': string;
    'settings.ffmpegExecutablePathTooltip': string;
    'settings.autoDetectFfmpeg': string;
    'settings.encoderDetection': string;
    'settings.detectEncoder': string;
    'settings.validating': string;
    'settings.encodingPresetFor': string;
    'settings.noWorkingEncoderDesc': string;
    'settings.ffmpegCrf': string;
    'settings.workingEncoder': string;
    'settings.range': string;
    'settings.constantRateFactorFor': string;
    'settings.lowerIsBetter': string;
    'settings.ffmpegPreset': string;
    'settings.encodingPreset': string;

    // 设置页面 - Resize
    'settings.resizeMode': string;
    'settings.resizeNone': string;
    'settings.resizeFit': string;
    'settings.resizeFill': string;
    'settings.resizeLongestEdge': string;
    'settings.resizeShortestEdge': string;
    'settings.resizeWidth': string;
    'settings.resizeHeight': string;
    'settings.desiredWidth': string;
    'settings.desiredHeight': string;
    'settings.desiredLongestEdge': string;
    'settings.desiredShortestEdge': string;
    'settings.scaleMode': string;
    'settings.scaleModeDesc': string;
    'settings.scaleAuto': string;
    'settings.scaleOnlyReduce': string;
    'settings.scaleOnlyEnlarge': string;
    'settings.revertToOriginalIfLarger': string;
    'settings.revertToOriginalIfLargerDesc': string;
    'settings.minCompressionSavings': string;
    'settings.minCompressionSavingsDesc': string;

    // 设置页面 - Link/Path
    'settings.linkFormat': string;
    'settings.linkFormatDesc': string;
    'settings.pathFormat': string;
    'settings.pathFormatDesc': string;
    'settings.pathShortest': string;
    'settings.pathRelative': string;
    'settings.pathAbsolute': string;

    // 设置页面 - Non-destructive Resize
    'settings.resizeDimension': string;
    'settings.resizeDimensionDesc': string;
    'settings.resizeBothCustom': string;
    'settings.applyOriginalWidth': string;
    'settings.applyOriginalHeight': string;
    'settings.fitEditorMaxWidth': string;
    'settings.widthLabel': string;
    'settings.heightLabel': string;
    'settings.longestEdge': string;
    'settings.longestEdgeDesc': string;
    'settings.shortestEdge': string;
    'settings.shortestEdgeDesc': string;
    'settings.customValue': string;
    'settings.customValueDesc': string;
    'settings.maxWidthValue': string;
    'settings.maxWidthValueDesc': string;
    'settings.maintainAspectRatio': string;
    'settings.maintainAspectRatioDesc': string;
    'settings.setNewCustomWidth': string;
    'settings.setNewCustomHeight': string;
    'settings.respectEditorMaxWidth': string;
    'settings.respectEditorMaxWidthDesc': string;
    'settings.skipPatternsDesc': string;
    'settings.skipPatternsTooltip': string;

    // 设置页面 - Section 标题
    'settings.sectionDropPastePresets': string;
    'settings.sectionImageAlignment': string;
    'settings.sectionDragScrollResize': string;
    'settings.sectionCaptions': string;

    // 设置页面 - Tab 标签
    'settings.tabFolder': string;
    'settings.tabFilename': string;
    'settings.tabConversion': string;
    'settings.tabLinkFormat': string;
    'settings.tabResize': string;

    // 设置页面 - 预设组标题
    'settings.folderPresets': string;
    'settings.filenamePresets': string;
    'settings.conversionPresets': string;
    'settings.linkFormatPresets': string;
    'settings.resizePresets': string;

    // 设置页面 - 预设组描述
    'settings.folderPresetsDesc': string;
    'settings.filenamePresetsDesc': string;
    'settings.conversionPresetsDesc': string;
    'settings.linkFormatPresetsDesc': string;
    'settings.resizePresetsDesc': string;

    // 设置页面 - Tooltip 描述
    'settings.tooltip.rightClickMenu': string;
    'settings.tooltip.cursorAfterDrop': string;
    'settings.tooltip.neverProcessFilenames': string;
    'settings.tooltip.showSizeNotification': string;
    'settings.tooltip.dragResize': string;
    'settings.tooltip.cursorDuringResize': string;
    'settings.tooltip.alignmentCacheLocation': string;
    'settings.tooltip.alignmentCacheLocationDefault': string;

    // 设置页面 - 对齐缓存描述
    'settings.alignmentCacheLocationDesc': string;
    'settings.alignmentCacheCleanupDesc': string;

    // 设置页面 - Dropdown 选项
    'settings.option.atFrontOfLink': string;
    'settings.option.atBackOfLink': string;
    'settings.option.oneLineBelow': string;
    'settings.option.dontMoveCursor': string;
    'settings.option.alwaysShow': string;
    'settings.option.neverShow': string;
    'settings.option.askEachTime': string;
    'settings.option.none': string;
    'settings.option.left': string;
    'settings.option.center': string;
    'settings.option.right': string;
    'settings.option.uppercase': string;
    'settings.option.lowercase': string;
    'settings.option.capitalize': string;
    'settings.option.normal': string;
    'settings.option.bold': string;
    'settings.option.light': string;
    'settings.option.regular': string;
    'settings.option.medium': string;
    'settings.option.semiBold': string;
    'settings.option.italic': string;
    'settings.option.withinConfigFolder': string;
    'settings.option.withinPluginFolder': string;

    // 设置页面 - 滚轮修饰键选项
    'settings.option.shift': string;
    'settings.option.control': string;
    'settings.option.alt': string;
    'settings.option.meta': string;

    // 设置页面 - 按钮和操作
    'settings.tooltip.saveAsNewGlobalPreset': string;
    'settings.tooltip.deleteGlobalPreset': string;
    'settings.tooltip.edit': string;
    'settings.tooltip.delete': string;
    'settings.addNew': string;
    'settings.button.save': string;
    'settings.button.add': string;
    'settings.button.cancel': string;

    // 设置页面 - 确认对话框
    'settings.confirm.deletePreset': string;
    'settings.confirm.deletePresetMessage': string;
    'settings.confirm.deleteGlobalPreset': string;
    'settings.confirm.deleteGlobalPresetMessage': string;

    // 设置页面 - 保存全局预设模态框
    'settings.saveGlobalPreset.title': string;
    'settings.saveGlobalPreset.presetName': string;
    'settings.saveGlobalPreset.placeholder': string;
    'settings.saveGlobalPreset.summary': string;

    // 设置页面 - 变量模态框
    'settings.variablesModal.title': string;
    'settings.variablesModal.searchPlaceholder': string;
    'settings.variablesModal.variable': string;
    'settings.variablesModal.description': string;
    'settings.variablesModal.example': string;
    'settings.variablesModal.noResults': string;

    // 设置页面 - Link format 示例
    'settings.linkFormat.examples': string;
    'settings.linkFormat.noteLocation': string;
    'settings.linkFormat.imageLocation': string;
    'settings.linkFormat.pathBecomes': string;
    'settings.linkFormat.shortest': string;
    'settings.linkFormat.relative': string;
    'settings.linkFormat.absolute': string;
    'settings.linkFormat.shortestDesc': string;
    'settings.linkFormat.relativeDesc': string;
    'settings.linkFormat.absoluteDesc': string;
    'settings.hideAltText': string;
    'settings.hideAltTextDesc': string;

    // 设置页面 - AVIF 编码器默认描述
    'settings.avif.defaultEncoderDesc': string;
    'settings.avif.defaultCrfDesc': string;
    'settings.avif.encodingPreset': string;

    // 设置页面 - 跳过模式标题
    'settings.skipRenamePatterns': string;
    'settings.skipConversionPatterns': string;

    // 设置页面 - 预设摘要文本
    'settings.summary.defaultObsidian': string;
    'settings.summary.rootFolder': string;
    'settings.summary.sameFolder': string;
    'settings.summary.inSubfolder': string;
    'settings.summary.customLocation': string;
    'settings.summary.unknownLocation': string;
    'settings.summary.exampleLoading': string;
    'settings.summary.exampleError': string;
    'settings.summary.skipRenamePatterns': string;
    'settings.summary.ifOutputExists': string;
    'settings.summary.format': string;
    'settings.summary.quality': string;
    'settings.summary.colorDepth': string;
    'settings.summary.ffmpegCrf': string;
    'settings.summary.ffmpegPreset': string;
    'settings.summary.resize': string;
    'settings.summary.width': string;
    'settings.summary.height': string;
    'settings.summary.longestEdge': string;
    'settings.summary.shortestEdge': string;
    'settings.summary.enlargeReduce': string;
    'settings.summary.allowLargerFiles': string;
    'settings.summary.yes': string;
    'settings.summary.no': string;
    'settings.summary.skipPatterns': string;
    'settings.summary.revertToOriginal': string;
    'settings.summary.minCompressionSavings': string;
    'settings.summary.noResizing': string;
    'settings.summary.scaleModeLabel': string;
    'settings.summary.respectEditorMaxWidth': string;
    'settings.summary.maintainAspectRatio': string;
    'settings.summary.originalWidth': string;
    'settings.summary.originalHeight': string;
    'settings.summary.editorMaxWidth': string;
    'settings.summary.custom': string;
    'settings.summary.dimension': string;
    'settings.summary.linkType': string;
    'settings.summary.pathFormat': string;
    'settings.summary.type': string;
    'settings.summary.subfolderTemplate': string;
    'settings.summary.customTemplate': string;
    'settings.summary.template': string;
    'settings.summary.outputFormat': string;
    'settings.summary.dimensions': string;
    'settings.summary.edge': string;
    'settings.summary.scale': string;
    'settings.summary.presetSuffix': string;

    // 设置页面 - 预览错误
    'settings.previewError': string;

    // ==================== 插入图片ID引用 ====================
    'figureRef.insertReference': string;
    'figureRef.insertReferenceCommand': string;
    'figureRef.searchPlaceholder': string;
    'figureRef.noFiguresFound': string;
    'figureRef.notice.noActiveEditor': string;
    'figureRef.notice.noFiguresInNote': string;
    'figureRef.notice.referenceInserted': string;

    // 允许通过索引签名访问
    [key: string]: string;
}

export type TranslationKey = keyof TranslationStrings;
export type Locale = 'en' | 'zh';
