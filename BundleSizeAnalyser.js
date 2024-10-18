/**
 * Class representing a Bundle Size Analyser.
 * Analyses the bundle sizes of components, checks them against a baseline, and verifies if they exceed size limits.
 */
class BundleSizeAnalyser {
    /**
     * Constructs the BundleSizeAnalyser class.
     * @param {Object} fs - The file system module for reading and writing files.
     * @param {Object} path - The path module for file path resolution.
     * @param {Function} glob - A glob function to match file patterns.
     * @param {Function} gzipSize - Function to calculate the size of files when gzipped.
     * @param {Object} brotliSize - Module to calculate the size of files when Brotli compressed.
     * @param {Object} chalk - Module for coloured terminal output.
     */
    constructor(fs, path, glob, gzipSize, brotliSize, chalk) {
        this.fs = fs;
        this.path = path;
        this.glob = glob;
        this.gzipSize = gzipSize;
        this.brotliSize = brotliSize;
        this.chalk = chalk;
        this.results = {};
        this.hasWarnings = false;
    }

    /**
     * Loads the configuration JSON from the specified path.
     * @param {string} configPath - The path to the configuration file.
     * @returns {Promise<Object>} The parsed JSON configuration.
     */
    async loadConfig(configPath) {
        const configContent = await this.fs.readFile(configPath, 'utf8');
        return JSON.parse(configContent);
    }

    /**
     * Loads the baseline sizes from the baseline file.
     * If the baseline file does not exist, returns an empty object.
     * @param {string} baselineFile - The path to the baseline file.
     * @returns {Promise<Object>} The parsed JSON baseline sizes.
     */
    async loadBaseline(baselineFile) {
        const baselinePath = this.path.resolve(process.cwd(), baselineFile);
        try {
            const baselineContent = await this.fs.readFile(baselinePath, 'utf8');
            return JSON.parse(baselineContent);
        } catch (error) {
            return {}; // Return an empty object if the baseline file does not exist
        }
    }

    /**
     * Collects all file paths that match the inclusion patterns and do not match the exclusion patterns.
     * @param {string[]} includePatterns - File patterns to include.
     * @param {string[]} excludePatterns - File patterns to exclude.
     * @returns {Promise<string[]>} A list of unique file paths.
     */
    async collectFiles(includePatterns, excludePatterns) {
        let filePaths = [];
        for (const pattern of includePatterns) {
            const files = await this.glob(pattern);
            filePaths.push(...files);
        }

        for (const pattern of excludePatterns) {
            const files = await this.glob(pattern);
            filePaths = filePaths.filter((file) => !files.includes(file));
        }

        return [...new Set(filePaths)]; // Remove duplicates
    }

    /**
     * Calculates the size of the given files, along with gzip and Brotli compressed sizes.
     * @param {string[]} filePaths - A list of file paths to analyze.
     * @param {Object} compression - An object specifying whether to calculate gzip and Brotli sizes.
     * @returns {Promise<Object>} An object containing total, gzip, and Brotli sizes in KB.
     */
    async calculateSizes(filePaths, compression) {
        let totalSize = 0;
        let totalGzipSize = 0;
        let totalBrotliSize = 0;

        for (const filePath of filePaths) {
            const fileContent = await this.fs.readFile(filePath);
            const fileSize = fileContent.length;
            totalSize += fileSize;

            if (compression.gzip) {
                totalGzipSize += await this.gzipSize(fileContent);
            }

            if (compression.brotli) {
                totalBrotliSize += this.brotliSize.sync(fileContent);
            }
        }

        return {
            totalSizeKB: totalSize / 1024,
            totalGzipSizeKB: totalGzipSize / 1024,
            totalBrotliSizeKB: totalBrotliSize / 1024,
        };
    }

    /**
     * Compares the current component size with the baseline and thresholds.
     * @param {Object} result - The calculated sizes.
     * @param {string} componentName - The name of the component.
     * @param {Object} baselineSizes - The baseline sizes to compare against.
     * @param {Object} config - Configuration settings for the component (e.g., max size).
     * @returns {Object} The result object augmented with comparison information.
     */
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

    /**
     * Outputs the results of the bundle size analysis to the console.
     */
    outputResults() {
        console.log(this.chalk.bold('\nBundle Size Analyser Report\n'));
        for (const [componentName, result] of Object.entries(this.results)) {
            console.log(this.chalk.blue.bold(`Component: ${componentName}`));
            console.log(`Total Size: ${result.totalSizeKB.toFixed(2)} KB`);
            if (result.totalGzipSizeKB) {
                console.log(`Gzip Size: ${result.totalGzipSizeKB.toFixed(2)} KB`);
            }
            if (result.totalBrotliSizeKB) {
                console.log(`Brotli Size: ${result.totalBrotliSizeKB.toFixed(2)} KB`);
            }

            if (result.exceedsMaxSize) {
                console.log(
                    this.chalk.red(
                        `Exceeded max size of ${result.maxSize} by ${(
                            result.totalSizeKB -
                            this.parseSize(result.maxSize) / 1024
                        ).toFixed(2)} KB`
                    )
                );
            } else {
                console.log(this.chalk.green(`Within max size limit of ${result.maxSize}`));
            }

            if (result.percentageIncrease !== 'N/A') {
                if (result.exceedsWarnIncrease) {
                    console.log(
                        this.chalk.red(
                            `Size increased by ${result.percentageIncrease}% since last recorded size, exceeding threshold of ${result.warnOnIncrease}`
                        )
                    );
                } else {
                    console.log(
                        this.chalk.green(
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

    /**
     * Updates the baseline file with the new component sizes.
     * @param {string} baselineFile - The path to the baseline file.
     */
    async updateBaseline(baselineFile) {
        const baselinePath = this.path.resolve(process.cwd(), baselineFile);
        const newBaselineSizes = {};
        for (const [componentName, result] of Object.entries(this.results)) {
            newBaselineSizes[componentName] = result.totalSizeKB * 1024; // Store in bytes
        }
        await this.fs.writeFile(baselinePath, JSON.stringify(newBaselineSizes, null, 2));
    }

    /**
     * Parses a size string (e.g., '5MB', '500KB') into bytes.
     * @param {string} sizeStr - The size string to parse.
     * @returns {number|null} The size in bytes, or null if the format is invalid.
     */
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

    /**
     * Parses a percentage string (e.g., '5%') into a float value.
     * @param {string} percentageStr - The percentage string to parse.
     * @returns {number|null} The percentage value, or null if the format is invalid.
     */
    parsePercentage(percentageStr) {
        if (typeof percentageStr !== 'string') return null;
        const match = percentageStr.trim().match(/^(\d+(?:\.\d+)?)\s*%$/);
        if (!match) return null;
        return parseFloat(match[1]);
    }

    /**
     * Analyses the sizes of the components defined in the configuration.
     * Compares the sizes against the baseline and outputs the results.
     * Updates the baseline with new sizes if necessary.
     * @param {Object} config - The configuration object for the components.
     */
    async analyseComponents(config) {
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
            console.error(this.chalk.red('One or more components exceeded size thresholds.'));
            process.exit(1);
        } else {
            console.log(this.chalk.green('All components are within size thresholds.'));
            process.exit(0);
        }
    }
}

export default BundleSizeAnalyser;
