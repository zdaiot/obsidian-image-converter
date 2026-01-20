/**
 * Unit tests for AVIF encoder detection
 * Tests cross-platform encoder detection and CRF validation
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, import/no-nodejs-modules */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// Mock child_process before imports
vi.mock('child_process');

import { ImageProcessor, ENCODER_CONFIGS } from '../../../src/ImageProcessor';
import { SupportedImageFormats } from '../../../src/SupportedImageFormats';
import { fakeApp } from '../../factories/obsidian';

describe('Unit: ImageProcessor AVIF Encoder Detection', () => {
  let processor: ImageProcessor;
  let supportedFormats: SupportedImageFormats;

  beforeEach(() => {
    const app = fakeApp() as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Test factory returns compatible mock
    supportedFormats = new SupportedImageFormats(app);
    processor = new ImageProcessor(supportedFormats);
    vi.clearAllMocks();
    
    // Clear static cache between tests
    (ImageProcessor as any).encoderDetectionCache.clear();
  });

  /**
   * Helper to mock spawn with encoder list and validation
   */
  function mockSpawnWithValidation(encoderListOutput: string, validationSuccess = true) {
    let callCount = 0;
    return () => {
      callCount++;
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.killed = false;
      
      if (callCount === 1) {
        // First call: encoder list
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from(encoderListOutput));
          mockProcess.emit('close', 0);
        }, 0);
      } else {
        // Second+ calls: validation (test encode)
        setTimeout(() => {
          if (validationSuccess) {
            mockProcess.stderr?.emit('data', Buffer.from('frame=    1 fps=0.0 q=0.0 Lsize=       0kB'));
            mockProcess.emit('close', 0); // Success
          } else {
            mockProcess.stderr?.emit('data', Buffer.from('Cannot load nvcuda.dll'));
            mockProcess.emit('close', 1); // Failure
          }
        }, 0);
      }
      
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return mockProcess;
    };
  }

  describe('detectAvifEncoder', () => {
    it('should detect libaom-av1 encoder', async () => {
      // Arrange
      const { spawn } = await import('child_process');
      (spawn as any).mockImplementation(mockSpawnWithValidation('V....D libaom-av1           libaom AV1 (codec av1)'));

      // Act
      const encoder = await (processor as any).detectAvifEncoder('/usr/bin/ffmpeg');

      // Assert
      expect(encoder).toBe('libaom-av1');
      expect(spawn).toHaveBeenCalledTimes(2); // List + validation
    });

    it('should detect libsvtav1 encoder (prefer over libaom)', async () => {
      // Arrange
      const { spawn } = await import('child_process');
      (spawn as any).mockImplementation(mockSpawnWithValidation('V....D libsvtav1            SVT-AV1 encoder\nV....D libaom-av1           libaom AV1'));

      // Act
      const encoder = await (processor as any).detectAvifEncoder('/usr/bin/ffmpeg');

      // Assert
      expect(encoder).toBe('libsvtav1'); // Should prefer faster encoder
    });

    it('should detect av1_nvenc hardware encoder (NVIDIA)', async () => {
      // Arrange
      const { spawn } = await import('child_process');
      (spawn as any).mockImplementation(mockSpawnWithValidation('V....D av1_nvenc            NVIDIA NVENC av1 encoder'));

      // Act
      const encoder = await (processor as any).detectAvifEncoder('C:/ffmpeg/bin/ffmpeg.exe');

      // Assert
      expect(encoder).toBe('av1_nvenc');
    });

    it('should normalize quoted executable paths before spawning', async () => {
      const { spawn } = await import('child_process');
      (spawn as any).mockImplementation(mockSpawnWithValidation('V....D libaom-av1           libaom AV1 (codec av1)'));

      const encoder = await (processor as any).detectAvifEncoder(' "C:/ffmpeg/bin/ffmpeg.exe" ');

      expect(encoder).toBe('libaom-av1');
      const [firstCall] = (spawn as any).mock.calls;
      expect(firstCall[0]).toBe('C:\\ffmpeg\\bin\\ffmpeg.exe');
    });

    it('should detect av1_videotoolbox on macOS', async () => {
      // Arrange
      const { spawn } = await import('child_process');
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Obsidian API export
      const { Platform } = await import('obsidian');
      
      // Mock macOS platform
      Object.defineProperty(Platform, 'isMacOS', { value: true, configurable: true });
      
      (spawn as any).mockImplementation(mockSpawnWithValidation('V....D av1_videotoolbox     AV1 (VideoToolbox acceleration)'));

      // Act
      const encoder = await (processor as any).detectAvifEncoder('/usr/local/bin/ffmpeg');

      // Assert
      expect(encoder).toBe('av1_videotoolbox');
    });

    it('should detect av1_qsv hardware encoder (Intel)', async () => {
      // Arrange
      const { spawn } = await import('child_process');
      (spawn as any).mockImplementation(mockSpawnWithValidation('V..... av1_qsv              AV1 (Intel Quick Sync Video)'));

      // Act
      const encoder = await (processor as any).detectAvifEncoder('/usr/bin/ffmpeg');

      // Assert
      expect(encoder).toBe('av1_qsv');
    });

    it('should detect av1_amf hardware encoder (AMD)', async () => {
      // Arrange
      const { spawn } = await import('child_process');
      (spawn as any).mockImplementation(mockSpawnWithValidation('V....D av1_amf              AMD AMF AV1 encoder'));

      // Act
      const encoder = await (processor as any).detectAvifEncoder('/usr/bin/ffmpeg');

      // Assert
      expect(encoder).toBe('av1_amf');
    });

    it('should return null when no encoder found', async () => {
      // Arrange
      const { spawn } = await import('child_process');
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.killed = false;
      (spawn as any).mockReturnValue(mockProcess);

      // Act
      const detectionPromise = (processor as any).detectAvifEncoder('/usr/bin/ffmpeg');
      
      // Simulate FFmpeg output without AV1 encoders
      mockProcess.stdout.emit('data', Buffer.from('V....D libx264              H.264 encoder'));
      mockProcess.emit('close', 0);

      const encoder = await detectionPromise;

      // Assert
      expect(encoder).toBe(null);
    });

    it('should cache detection results', async () => {
      // Arrange
      const { spawn } = await import('child_process');
      (spawn as any).mockImplementation(mockSpawnWithValidation('V....D libaom-av1           libaom AV1'));

      // Act - first call
      await (processor as any).detectAvifEncoder('/usr/bin/ffmpeg');

      // Act - second call with same path
      const encoder2 = await (processor as any).detectAvifEncoder('/usr/bin/ffmpeg');

      // Assert
      expect(spawn).toHaveBeenCalledTimes(2); // List + validation (cached after that)
      expect(encoder2).toBe('libaom-av1');
    });

    it('should reuse cache for normalized executable paths', async () => {
      // Arrange
      const { spawn } = await import('child_process');
      (spawn as any).mockImplementation(mockSpawnWithValidation('V....D libaom-av1           libaom AV1'));

      // Act - quoted path
      await (processor as any).detectAvifEncoder(' "C:/ffmpeg/bin/ffmpeg.exe" ');

      // Act - normalized path
      const encoder2 = await (processor as any).detectAvifEncoder('C:/ffmpeg/bin/ffmpeg.exe');

      // Assert
      expect(spawn).toHaveBeenCalledTimes(2); // List + validation once
      expect(encoder2).toBe('libaom-av1');
    });

    it('should short-circuit when cached encoder is provided', async () => {
      // Arrange
      const { spawn } = await import('child_process');

      // Act
      const encoder = await (processor as any).detectAvifEncoder('/usr/bin/ffmpeg', 'libaom-av1');

      // Assert
      expect(encoder).toBe('libaom-av1');
      expect(spawn).not.toHaveBeenCalled();
    });

    it('should handle spawn errors gracefully', async () => {
      // Arrange
      const { spawn } = await import('child_process');
      (spawn as any).mockImplementation(() => {
        throw new Error('Command not found');
      });

      // Act
      const encoder = await (processor as any).detectAvifEncoder('/invalid/path/ffmpeg');

      // Assert
      expect(encoder).toBe(null);
    });

    it('should handle process errors gracefully', async () => {
      // Arrange
      const { spawn } = await import('child_process');
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.killed = false;
      (spawn as any).mockReturnValue(mockProcess);

      // Act
      const detectionPromise = (processor as any).detectAvifEncoder('/usr/bin/ffmpeg');
      mockProcess.emit('error', new Error('Process error'));

      const encoder = await detectionPromise;

      // Assert
      expect(encoder).toBe(null);
    });

    it('should timeout after 3 seconds', async () => {
      // Arrange
      const { spawn } = await import('child_process');
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.killed = false;
      mockProcess.kill = vi.fn();
      (spawn as any).mockReturnValue(mockProcess);

      // Act
      vi.useFakeTimers();
      const detectionPromise = (processor as any).detectAvifEncoder('/usr/bin/ffmpeg');
      
      // Fast-forward time
      vi.advanceTimersByTime(3000);
      
      const encoder = await detectionPromise;
      
      vi.useRealTimers();

      // Assert
      expect(encoder).toBe(null);
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });

  describe('validateCrf', () => {
    it('should return crf as-is when within valid range for libaom-av1', () => {
      // Act
      const validatedCrf = (processor as any).validateCrf(30, 'libaom-av1');

      // Assert
      expect(validatedCrf).toBe(30);
    });

    it('should clamp crf to min for libaom-av1 (0-63)', () => {
      // Act
      const validatedCrf = (processor as any).validateCrf(-5, 'libaom-av1');

      // Assert
      expect(validatedCrf).toBe(0);
    });

    it('should clamp crf to max for libaom-av1 (0-63)', () => {
      // Act
      const validatedCrf = (processor as any).validateCrf(100, 'libaom-av1');

      // Assert
      expect(validatedCrf).toBe(63);
    });

    it('should clamp crf to max for av1_nvenc (0-51)', () => {
      // Act
      const validatedCrf = (processor as any).validateCrf(60, 'av1_nvenc');

      // Assert
      expect(validatedCrf).toBe(51);
    });

    it('should handle av1_amf range (0-255)', () => {
      // Act
      const validatedCrf = (processor as any).validateCrf(200, 'av1_amf');

      // Assert
      expect(validatedCrf).toBe(200);
    });

    it('should clamp to max for av1_amf (0-255)', () => {
      // Act
      const validatedCrf = (processor as any).validateCrf(300, 'av1_amf');

      // Assert
      expect(validatedCrf).toBe(255);
    });

    it('should handle av1_videotoolbox range (0-100)', () => {
      // Act
      const validatedCrf = (processor as any).validateCrf(80, 'av1_videotoolbox');

      // Assert
      expect(validatedCrf).toBe(80);
    });
  });

  describe('ENCODER_CONFIGS', () => {
    it('should have correct configuration for libaom-av1', () => {
      const config = ENCODER_CONFIGS['libaom-av1'];
      
      expect(config.crfMin).toBe(0);
      expect(config.crfMax).toBe(63);
      expect(config.supportsPreset).toBe(true);
      expect(config.platformHint).toBe('software');
    });

    it('should have correct configuration for av1_nvenc', () => {
      const config = ENCODER_CONFIGS['av1_nvenc'];
      
      expect(config.crfMin).toBe(0);
      expect(config.crfMax).toBe(51);
      expect(config.supportsPreset).toBe(true);
      expect(config.platformHint).toBe('nvidia');
    });

    it('should have correct configuration for av1_videotoolbox', () => {
      const config = ENCODER_CONFIGS['av1_videotoolbox'];
      
      expect(config.crfMin).toBe(0);
      expect(config.crfMax).toBe(100);
      expect(config.supportsPreset).toBe(false);
      expect(config.platformHint).toBe('apple');
    });

    it('should have correct configuration for av1_qsv', () => {
      const config = ENCODER_CONFIGS['av1_qsv'];
      
      expect(config.crfMin).toBe(0);
      expect(config.crfMax).toBe(51);
      expect(config.supportsPreset).toBe(false);
      expect(config.platformHint).toBe('intel');
    });
  });
});
