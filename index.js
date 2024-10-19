#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { Command } from 'commander';
import chalk from 'chalk';
import zlib from 'zlib';
import BundleSizeAnalyser from './BundleSizeAnalyser.js';


(async () => {
    const startTime = Date.now();
    const program = new Command();
    program.option('-c, --config <path>', 'Path to configuration file', 'compsizer.config.json');
    program.parse(process.argv);

    const options = program.opts();
    const configPath = path.resolve(process.cwd(), options.config);

    try {
        const analyser = new BundleSizeAnalyser(fs, path, glob, zlib, chalk);
        const config = await analyser.loadConfig(configPath);
        const success = await analyser.analyseComponents(config);
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        console.log(chalk.green.bold(`\ncompsizer analysis took: ${duration.toFixed(2)} seconds\n`));

        process.exit(success ? 0 : 1);

    } catch (error) {
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
    }
})();
