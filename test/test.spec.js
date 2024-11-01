import { describe, it, expect } from 'vitest';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';

const execPromise = util.promisify(exec);

describe('BundleSizeAnalyser Integration Test', () => {
  it('should correctly report the size of JS, gzipped, and brotli compressed files', async () => {
    const toolPath = path.resolve(__dirname, '../index.js');
    const { stdout, stderr } = await execPromise(`node ${toolPath}`);

    expect(stderr).toBeFalsy();
    expect(stdout).toContain('Total Size: 95.25 KB');
    expect(stdout).toContain('Gzip Size: 5.00 KB');
    expect(stdout).toContain('Brotli Size: 2.27 KB');
  });
});
