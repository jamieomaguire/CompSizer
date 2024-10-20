import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
import path from 'path';

const execPromise = util.promisify(exec);

describe('BundleSizeAnalyser Integration Test', () => {
  it('should correctly report the size of JS, gzipped, and brotli compressed files', async () => {
    const toolPath = path.resolve(__dirname, '../index.js');
    const configPath = path.join(__dirname, 'compsizer.config.json');

    const { stdout, stderr } = await execPromise(`node ${toolPath} -c ${configPath}`);

    expect(stderr).toBeFalsy();
    expect(stdout).toContain('Total Size: 95.25 KB');
    expect(stdout).toContain('Gzip Size: 5.00 KB');
    expect(stdout).toContain('Brotli Size: 2.27 KB');
  });
});
