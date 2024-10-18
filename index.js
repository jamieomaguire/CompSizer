#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { Command } from 'commander';
import chalk from 'chalk';
import { gzipSize } from 'gzip-size';

// Import createRequire to allow using require in an ES module
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import CommonJS modules using require
const brotliSize = require('brotli-size');

const program = new Command();

program
    .option('-c, --config <path>', 'Path to configuration file', 'bundle-size.config.json')
    .parse(process.argv);

const options = program.opts();

(async () => {
    try {
        // Read the configuration file
        const configPath = path.resolve(process.cwd(), options.config);
        const configContent = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(configContent);

        const {
            include = [],
            exclude = [],
            compression = { gzip: true, brotli: true },
            baselineFile = 'bundle-sizes.json',
            components = {},
            defaults = {},
        } = config;

        // Read baseline sizes
        let baselineSizes = {};
        const baselinePath = path.resolve(process.cwd(), baselineFile);
        try {
            const baselineContent = await fs.readFile(baselinePath, 'utf8');
            baselineSizes = JSON.parse(baselineContent);
        } catch (error) {
            // Baseline file does not exist; proceed without baseline sizes
        }

        let hasWarnings = false;
        const results = {};

        for (const [componentName, componentConfig] of Object.entries(components)) {
            const {
                maxSize,
                warnOnIncrease = defaults.warnOnIncrease || '5%',
                include: componentInclude = include,
                exclude: componentExclude = exclude,
            } = componentConfig;

            // Collect files for the component
            const includePatterns = Array.isArray(componentInclude) ? componentInclude : [componentInclude];
            const excludePatterns = Array.isArray(componentExclude) ? componentExclude : [componentExclude];

            let filePaths = [];
            for (const pattern of includePatterns) {
                const files = await glob(pattern);
                filePaths.push(...files);
            }

            // Exclude patterns
            for (const pattern of excludePatterns) {
                const files = await glob(pattern);
                filePaths = filePaths.filter((file) => !files.includes(file));
            }

            // Remove duplicates
            filePaths = [...new Set(filePaths)];

            // Debugging output (optional)
            // console.log(chalk.yellow(`\nFiles to analyze for component '${componentName}':`));
            // filePaths.forEach((file) => console.log(` - ${file}`));

            // Calculate sizes
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

            // Convert sizes to KB
            const totalSizeKB = totalSize / 1024;
            const totalGzipSizeKB = totalGzipSize / 1024;
            const totalBrotliSizeKB = totalBrotliSize / 1024;

            // Compare against maxSize
            const maxSizeValue = parseSize(maxSize);
            let exceedsMaxSize = false;
            if (maxSizeValue !== null && totalSize > maxSizeValue) {
                exceedsMaxSize = true;
                hasWarnings = true;
            }

            // Compare against baseline
            const previousSize = baselineSizes[componentName] || 0;
            const sizeIncrease = totalSize - previousSize;
            const percentageIncrease = previousSize
                ? ((sizeIncrease / previousSize) * 100).toFixed(2)
                : 'N/A';

            let exceedsWarnIncrease = false;
            if (previousSize && warnOnIncrease) {
                const warnIncreaseValue = parsePercentage(warnOnIncrease);
                if (
                    warnIncreaseValue !== null &&
                    percentageIncrease !== 'N/A' &&
                    percentageIncrease > warnIncreaseValue
                ) {
                    exceedsWarnIncrease = true;
                    hasWarnings = true;
                }
            }

            results[componentName] = {
                totalSizeKB,
                totalGzipSizeKB,
                totalBrotliSizeKB,
                exceedsMaxSize,
                maxSize,
                sizeIncreaseKB: sizeIncrease / 1024,
                percentageIncrease,
                exceedsWarnIncrease,
                warnOnIncrease,
            };
        }

        // Output the report
        console.log(chalk.bold('\nBundle Size Analyzer Report\n'));
        for (const [componentName, result] of Object.entries(results)) {
            console.log(chalk.blue.bold(`Component: ${componentName}`));
            console.log(`Total Size: ${result.totalSizeKB.toFixed(2)} KB`);
            if (compression.gzip) {
                console.log(`Gzip Size: ${result.totalGzipSizeKB.toFixed(2)} KB`);
            }
            if (compression.brotli) {
                console.log(`Brotli Size: ${result.totalBrotliSizeKB.toFixed(2)} KB`);
            }
            if (result.exceedsMaxSize) {
                console.log(
                    chalk.red(
                        `Exceeded max size of ${result.maxSize} by ${(
                            result.totalSizeKB -
                            parseSize(result.maxSize) / 1024
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

        // Update the baseline file
        const newBaselineSizes = {};
        for (const [componentName, result] of Object.entries(results)) {
            newBaselineSizes[componentName] = result.totalSizeKB * 1024; // Store in bytes
        }
        await fs.writeFile(baselinePath, JSON.stringify(newBaselineSizes, null, 2));

        // Exit with appropriate code
        if (hasWarnings) {
            console.error(chalk.red('One or more components exceeded size thresholds.'));
            process.exit(1);
        } else {
            console.log(chalk.green('All components are within size thresholds.'));
            process.exit(0);
        }
    } catch (error) {
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
    }
})();

// Helper functions
function parseSize(sizeStr) {
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

function parsePercentage(percentageStr) {
    if (typeof percentageStr !== 'string') return null;
    const match = percentageStr.trim().match(/^(\d+(?:\.\d+)?)\s*%$/);
    if (!match) return null;
    return parseFloat(match[1]);
}
