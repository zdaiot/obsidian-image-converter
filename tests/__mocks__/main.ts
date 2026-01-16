/**
 * Mock implementation of the main plugin module
 */

import { Plugin } from 'obsidian';
import type { ImageConverterSettings } from '../../src/ImageConverterSettings';

export default class ImageConverterPlugin extends Plugin {
  settings: Partial<ImageConverterSettings> = {};

  async loadSettings() {
    this.settings = {};
  }

  async saveSettings() {
    // Mock implementation
  }
}
