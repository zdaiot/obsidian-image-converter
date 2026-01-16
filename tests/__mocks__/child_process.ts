import { vi } from 'vitest';

export class ChildProcess {
  stdin = { 
    write: vi.fn(), 
    end: vi.fn(),
    on: vi.fn()
  };
  stdout = { 
    on: vi.fn(),
    pipe: vi.fn()
  };
  stderr = { 
    on: vi.fn(),
    pipe: vi.fn()
  };
  on = vi.fn();
  kill = vi.fn();
  pid = 12345;
}

export const spawn = vi.fn(() => new ChildProcess());

export const exec = vi.fn((cmd: string, callback?: (error: Error | null, stdout: string, stderr: string) => void) => {
  if (callback) callback(null, '', '');
  return new ChildProcess();
});
export const execSync = vi.fn(() => Buffer.from(''));
export const fork = vi.fn(() => new ChildProcess());