#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { Command } from 'commander';
import chalk from 'chalk';
import { gzipSize } from 'gzip-size';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const brotliSize = require('brotli-size');

class BundleSizeAnalyzer {
    constructor(configPath) {
        this.configPath = configPath;
        this.results = {};
        this.hasWarnings = false;
    }

    async loadConfig() {
        const configContent = await fs.readFile(this.configPath, 'utf8');
        return JSON.parse(configContent);
    }

    async loadBaseline(baselineFile) {
        const baselinePath = path.resolve(process.cwd(), baselineFile);
        try {
            const baselineContent = await fs.readFile(baselinePath, 'utf8');
            return JSON.parse(baselineContent);
        } catch (error) {
            return {}; // Return an empty object if the baseline file does not exist
        }
    }

    async collectFiles(includePatterns, excludePatterns) {
        let filePaths = [];
        for (const pattern of includePatterns) {
            const files = await glob(pattern);
            filePaths.push(...files);
        }

        for (const pattern of excludePatterns) {
            const files = await glob(pattern);
            filePaths = filePaths.filter((file) => !files.includes(file));
        }

        return [...new Set(filePaths)]; // Remove duplicates
    }

    async calculateSizes(filePaths, compression) {
        let totalSize = 0;
        let totalGzipSize = 0;
        let totalBrotliSize = 0;

        for (const filePath of filePaths) {
            const fileContent = await fs.readFile(filePath);
            const fileSize = fileContent.length;
            totalSize += fileSize;

            if (compression.gzip) {
                totalGzipSize += await gzipSize(fileContent);
            }

            if (compression.brotli) {
                totalBrotliSize += brotliSize.sync(fileContent);
            }
        }

        return {
            totalSizeKB: totalSize / 1024,
            totalGzipSizeKB: totalGzipSize / 1024,
            totalBrotliSizeKB: totalBrotliSize / 1024,
        };
    }

    compareSizes(result, componentName, baselineSizes, config) {
        const { maxSize, warnOnIncrease } = config;
        const maxSizeValue = this.parseSize(maxSize);

        const exceedsMaxSize = maxSizeValue !== null && result.totalSizeKB * 1024 > maxSizeValue;
        if (exceedsMaxSize) this.hasWarnings = true;

        const previousSize = baselineSizes[componentName] || 0;
        const sizeIncrease = result.totalSizeKB * 1024 - previousSize;
        const percentageIncrease = previousSize
            ? ((sizeIncrease / previousSize) * 100).toFixed(2)
            : 'N/A';

        let exceedsWarnIncrease = false;
        if (previousSize && warnOnIncrease) {
            const warnIncreaseValue = this.parsePercentage(warnOnIncrease);
            if (
                warnIncreaseValue !== null &&
                percentageIncrease !== 'N/A' &&
                percentageIncrease > warnIncreaseValue
            ) {
                exceedsWarnIncrease = true;
                this.hasWarnings = true;
            }
        }

        return {
            ...result,
            exceedsMaxSize,
            maxSize,
            sizeIncreaseKB: sizeIncrease / 1024,
            percentageIncrease,
            exceedsWarnIncrease,
            warnOnIncrease,
        };
    }

    outputResults() {
        console.log(chalk.bold('\nBundle Size Analyzer Report\n'));
        for (const [componentName, result] of Object.entries(this.results)) {
            console.log(chalk.blue.bold(`Component: ${componentName}`));
            console.log(`Total Size: ${result.totalSizeKB.toFixed(2)} KB`);
            if (result.totalGzipSizeKB) {
                console.log(`Gzip Size: ${result.totalGzipSizeKB.toFixed(2)} KB`);
            }
            if (result.totalBrotliSizeKB) {
                console.log(`Brotli Size: ${result.totalBrotliSizeKB.toFixed(2)} KB`);
            }

            if (result.exceedsMaxSize) {
                console.log(
                    chalk.red(
                        `Exceeded max size of ${result.maxSize} by ${(
                            result.totalSizeKB -
                            this.parseSize(result.maxSize) / 1024
                        ).toFixed(2)} KB`
                    )
                );
            } else {
                console.log(chalk.green(`Within max size limit of ${result.maxSize}`));
            }

            if (result.percentageIncrease !== 'N/A') {
                if (result.exceedsWarnIncrease) {
                    console.log(
                        chalk.red(
                            `Size increased by ${result.percentageIncrease}% since last recorded size, exceeding threshold of ${result.warnOnIncrease}`
                        )
                    );
                } else {
                    console.log(
                        chalk.green(
                            `Size increase of ${result.percentageIncrease}% since last recorded size is within threshold of ${result.warnOnIncrease}`
                        )
                    );
                }
            } else {
                console.log('No baseline size to compare against.');
            }

            console.log('');
        }
    }

    async updateBaseline(baselineFile) {
        const baselinePath = path.resolve(process.cwd(), baselineFile);
        const newBaselineSizes = {};
        for (const [componentName, result] of Object.entries(this.results)) {
            newBaselineSizes[componentName] = result.totalSizeKB * 1024; // Store in bytes
        }
        await fs.writeFile(baselinePath, JSON.stringify(newBaselineSizes, null, 2));
    }

    parseSize(sizeStr) {
        if (typeof sizeStr !== 'string') return null;
        const match = sizeStr.trim().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB)?$/i);
        if (!match) return null;
        const value = parseFloat(match[1]);
        const unit = match[2] ? match[2].toUpperCase() : 'B';
        switch (unit) {
            case 'B':
                return value;
            case 'KB':
                return value * 1024;
            case 'MB':
                return value * 1024 * 1024;
            default:
                return null;
        }
    }

    parsePercentage(percentageStr) {
        if (typeof percentageStr !== 'string') return null;
        const match = percentageStr.trim().match(/^(\d+(?:\.\d+)?)\s*%$/);
        if (!match) return null;
        return parseFloat(match[1]);
    }

    async analyzeComponents(config) {
        const { include, exclude, compression, baselineFile, components, defaults } = config;
        const baselineSizes = await this.loadBaseline(baselineFile);

        for (const [componentName, componentConfig] of Object.entries(components)) {
            const {
                maxSize,
                warnOnIncrease = defaults.warnOnIncrease || '5%',
                include: componentInclude = include,
                exclude: componentExclude = exclude,
            } = componentConfig;

            const includePatterns = Array.isArray(componentInclude) ? componentInclude : [componentInclude];
            const excludePatterns = Array.isArray(componentExclude) ? componentExclude : [componentExclude];

            const filePaths = await this.collectFiles(includePatterns, excludePatterns);
            const sizeResults = await this.calculateSizes(filePaths, compression);

            this.results[componentName] = this.compareSizes(
                sizeResults,
                componentName,
                baselineSizes,
                { maxSize, warnOnIncrease }
            );
        }

        this.outputResults();
        await this.updateBaseline(baselineFile);

        if (this.hasWarnings) {
            console.error(chalk.red('One or more components exceeded size thresholds.'));
            process.exit(1);
        } else {
            console.log(chalk.green('All components are within size thresholds.'));
            process.exit(0);
        }
    }
}

(async () => {
    const program = new Command();
    program.option('-c, --config <path>', 'Path to configuration file', 'bundle-size.config.json');
    program.parse(process.argv);

    const options = program.opts();
    const configPath = path.resolve(process.cwd(), options.config);

    try {
        const analyzer = new BundleSizeAnalyzer(configPath);
        const config = await analyzer.loadConfig();
        await analyzer.analyzeComponents(config);
    } catch (error) {
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
    }
})();
