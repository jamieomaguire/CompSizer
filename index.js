#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { Command } from 'commander';
import { gzipSize } from 'gzip-size';
import { createRequire } from 'module';
import chalk from 'chalk';
import BundleSizeAnalyser from './BundleSizeAnalyser.js';

const require = createRequire(import.meta.url);
const brotliSize = require('brotli-size');

(async () => {
    const program = new Command();
    program.option('-c, --config <path>', 'Path to configuration file', 'bundle-size.config.json');
    program.parse(process.argv);

    const options = program.opts();
    const configPath = path.resolve(process.cwd(), options.config);

    try {
        const analyser = new BundleSizeAnalyser(fs, path, glob, gzipSize, brotliSize, chalk);
        const config = await analyser.loadConfig(configPath);
        await analyser.analyseComponents(config);
    } catch (error) {
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
    }
})();
