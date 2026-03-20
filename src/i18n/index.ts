import { moment } from 'obsidian';
import { en } from './en';
import { zh } from './zh';
import { TranslationStrings, TranslationKey, Locale } from './types';

export type { TranslationStrings, TranslationKey, Locale };

const translations: Record<Locale, TranslationStrings> = {
    en,
    zh,
};

let currentLocale: Locale = 'en';

/**
 * 检测当前语言环境，按优先级尝试多种方式
 */
function detectLanguage(): string {
    // 方式1: 通过 Obsidian 内置的 moment 获取（最可靠）
    try {
        const momentLocale = moment.locale();
        if (momentLocale) return momentLocale;
    } catch (e) {
        // ignore
    }

    // 方式2: 通过 document.documentElement.lang 属性获取
    try {
        const htmlLang = document.documentElement.lang;
        if (htmlLang) return htmlLang;
    } catch (e) {
        // ignore
    }

    // 方式3: 通过 localStorage 获取（Obsidian 可能存储在 'language' 键中）
    try {
        const storedLang = window.localStorage.getItem('language');
        if (storedLang) return storedLang;
    } catch (e) {
        // ignore
    }

    // 方式4: 通过浏览器 navigator 获取
    try {
        if (navigator.language) return navigator.language;
    } catch (e) {
        // ignore
    }

    return 'en';
}

/**
 * 初始化 i18n，根据 Obsidian 的语言设置自动选择语言
 */
export function initI18n(): void {
    const detectedLang = detectLanguage();
    
    if (detectedLang.startsWith('zh')) {
        currentLocale = 'zh';
    } else {
        currentLocale = 'en';
    }
    
    console.log(`[Image Converter] i18n initialized: detected="${detectedLang}", using="${currentLocale}"`);
}

/**
 * 获取当前语言
 */
export function getLocale(): Locale {
    return currentLocale;
}

/**
 * 设置语言
 */
export function setLocale(locale: Locale): void {
    currentLocale = locale;
}

/**
 * 获取翻译文本
 * 支持带参数的模板字符串，如 "找到 {count} 个匹配项"
 * 
 * @param key - 翻译键
 * @param params - 可选的模板参数
 * @returns 翻译后的字符串
 * 
 * @example
 * t('contextMenu.copyImage') // "复制图片"
 * t('contextMenu.notice.unableToFindImage', { filename: 'test.png' }) // "无法找到图片：test.png"
 */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
    const translation = translations[currentLocale]?.[key] 
        ?? translations['en']?.[key] 
        ?? key;
    
    if (!params) return translation;
    
    return Object.entries(params).reduce(
        (result, [paramKey, paramValue]) => result.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue)),
        translation
    );
}
