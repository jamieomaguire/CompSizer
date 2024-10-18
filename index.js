#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { Command } from 'commander';
import chalk from 'chalk';
import zlib from 'zlib';
import BundleSizeAnalyser from './BundleSizeAnalyser.js';

async function calculateGzipSize(fileContent) {
    return new Promise((resolve, reject) => {
        zlib.gzip(fileContent, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result.length);
            }
        });
    });
}

async function calculateBrotliSize(fileContent) {
    return new Promise((resolve, reject) => {
        zlib.brotliCompress(fileContent, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result.length);
            }
        });
    });
}

(async () => {
    const startTime = Date.now();  // Capture the start time
    const program = new Command();
    program.option('-c, --config <path>', 'Path to configuration file', 'compsizer.config.json');
    program.parse(process.argv);

    const options = program.opts();
    const configPath = path.resolve(process.cwd(), options.config); // Resolve config relative to the user's project

    try {
        const analyser = new BundleSizeAnalyser(fs, path, glob, calculateGzipSize, calculateBrotliSize, chalk);
        const config = await analyser.loadConfig(configPath);
        const success = await analyser.analyseComponents(config);  // Capture success/failure
        const endTime = Date.now();  // Capture the end time
        const duration = (endTime - startTime) / 1000;  // Calculate duration in seconds

        console.log(chalk.green.bold(`\ncompsizer analysis took: ${duration.toFixed(2)} seconds\n`));

        // Exit based on the success status
        process.exit(success ? 0 : 1);

    } catch (error) {
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
    }
})();
