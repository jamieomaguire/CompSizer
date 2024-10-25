class BundleSizeAnalyser {
    constructor(fs, path, glob, zlib, chalk) {
        this.fs = fs;
        this.path = path;
        this.glob = glob;
        this.zlib = zlib;
        this.chalk = chalk;
        this.results = {};
        this.failures = [];
        this.hasWarnings = false;
    }

    async calculateGzipSize(fileContent) {
        return new Promise((resolve, reject) => {
            this.zlib.gzip(fileContent, (err, result) => {
                if (err) {
                    reject(new Error(`Gzip compression failed: ${err.message}`));
                } else {
                    resolve(result.length);
                }
            });
        });
    }

    async calculateBrotliSize(fileContent) {
        return new Promise((resolve, reject) => {
            this.zlib.brotliCompress(fileContent, (err, result) => {
                if (err) {
                    reject(new Error(`Brotli compression failed: ${err.message}`));
                } else {
                    resolve(result.length);
                }
            });
        });
    }

    async loadConfig(configPath) {
        const configContent = await this.fs.readFile(configPath, 'utf8');
        return JSON.parse(configContent);
    }

    async loadBaseline(baselineFile) {
        const baselinePath = this.path.resolve(process.cwd(), baselineFile);
        try {
            const baselineContent = await this.fs.readFile(baselinePath, 'utf8');
            return JSON.parse(baselineContent);
        } catch (error) {
            return {}; // Return an empty object if the baseline file does not exist
        }
    }

    async collectFiles(includePatterns, excludePatterns) {
        const [includeFiles, excludeFiles] = await Promise.all([
            Promise.all(includePatterns.map(pattern => this.glob(pattern))),
            Promise.all(excludePatterns.map(pattern => this.glob(pattern))),
        ]);

        const allFiles = new Set(includeFiles.flat());
        const excludeSet = new Set(excludeFiles.flat());

        return [...allFiles].filter(file => !excludeSet.has(file));
    }

    async batchReadFiles(filePaths) {
        const fileContents = await Promise.all(filePaths.map((filePath) => this.fs.readFile(filePath)));
        return fileContents;
    }

    async calculateSizes(filePaths, compression) {
        const fileContents = await this.batchReadFiles(filePaths);  // Read all files in parallel

        const sizePromises = fileContents.map(async (fileContent, index) => {
            const fileSize = fileContent.length;
            let gzipSize = 0;
            let brotliSize = 0;

            if (compression.gzip) {
                gzipSize = await this.calculateGzipSize(fileContent);
            }

            if (compression.brotli) {
                brotliSize = await this.calculateBrotliSize(fileContent);
            }

            return {
                fileSize,
                gzipSize,
                brotliSize
            };
        });

        const results = await Promise.all(sizePromises);

        // Aggregate results
        const totalSize = results.reduce((acc, result) => acc + result.fileSize, 0);
        const totalGzipSize = results.reduce((acc, result) => acc + result.gzipSize, 0);
        const totalBrotliSize = results.reduce((acc, result) => acc + result.brotliSize, 0);

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
        if (exceedsMaxSize) {
            this.hasWarnings = true;
            this.failures.push({
                component: componentName,
                expectedThreshold: maxSize,
                actualSizeKB: result.totalSizeKB.toFixed(2)
            });
        }

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
        console.log(this.chalk.bold('\Component Bundle Sizes Report\n'));
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

    async outputFailureReport() {
        if (this.failures.length > 0) {
            const reportPath = this.path.resolve(process.cwd(), 'compsizer-failure-report.json');
            await this.fs.writeFile(reportPath, JSON.stringify(this.failures, null, 2));
            console.error(this.chalk.red(`Failure report generated at ${reportPath}`));
        }
    }

    async updateBaseline(baselineFile) {
        const baselinePath = this.path.resolve(process.cwd(), baselineFile);
        const newBaselineSizes = {};
        for (const [componentName, result] of Object.entries(this.results)) {
            newBaselineSizes[componentName] = result.totalSizeKB * 1024; // Store in bytes
        }
        await this.fs.writeFile(baselinePath, JSON.stringify(newBaselineSizes, null, 2));
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

    async analyseComponents(config) {
        const { exclude, compression, baselineFile, components, defaults } = config;
        const baselineSizes = await this.loadBaseline(baselineFile);

        for (const [componentName, componentConfig] of Object.entries(components)) {
            const {
                maxSize,
                warnOnIncrease = defaults.warnOnIncrease || '5%',
                distFolderLocation,
                exclude: componentExclude = exclude
            } = componentConfig;

            if (!distFolderLocation) {
                throw new Error(`Error: distFolderLocation is not defined for component: ${componentName}`);
            }

            const distFolderPath = this.path.resolve(process.cwd(), distFolderLocation);
            try {
                await this.fs.access(distFolderPath);
            } catch (err) {
                console.error(this.chalk.red(`Error: distFolderLocation ${distFolderPath} not found for component: ${componentName}`));
                throw new Error(`Dist folder not found for component: ${componentName}`);
            }

            const includePattern = `${distFolderPath}/**/*.js`;
            const excludePatterns = Array.isArray(componentExclude) ? componentExclude : [componentExclude];
            const allJsFiles = await this.collectFiles([includePattern], excludePatterns);
            const indexJsFiles = allJsFiles.filter(file => file.endsWith('index.js'));
            const reactJsFiles = allJsFiles.filter(file => file.endsWith('react.js'));
            const otherJsFiles = allJsFiles.filter(file => !file.endsWith('index.js') && !file.endsWith('react.js'));

            const indexJsSizeResults = await this.calculateSizes(indexJsFiles, compression);
            this.results[`${componentName}/index.js`] = this.compareSizes(
                indexJsSizeResults,
                `${componentName}/index.js`,
                baselineSizes,
                { maxSize, warnOnIncrease }
            );

            // Calculate sizes for index.js + react.js + other JS files, or just index.js + react.js if no other JS files
            if (reactJsFiles.length > 0) {
                const indexReactFiles = [...indexJsFiles, ...reactJsFiles];
                const indexReactOtherFiles = [...indexJsFiles, ...reactJsFiles, ...otherJsFiles];

                if (otherJsFiles.length > 0) {
                    // Include other JS files
                    const indexReactOtherSizeResults = await this.calculateSizes(indexReactOtherFiles, compression);
                    this.results[`${componentName}/index.js + react.js + other JS`] = this.compareSizes(
                        indexReactOtherSizeResults,
                        `${componentName}/index.js + react.js + other JS`,
                        baselineSizes,
                        { maxSize, warnOnIncrease }
                    );
                } else {
                    // Just index.js + react.js
                    const indexReactSizeResults = await this.calculateSizes(indexReactFiles, compression);
                    this.results[`${componentName}/index.js + react.js`] = this.compareSizes(
                        indexReactSizeResults,
                        `${componentName}/index.js + react.js`,
                        baselineSizes,
                        { maxSize, warnOnIncrease }
                    );
                }
            }

            // Calculate sizes for index.js + other JS files (excluding react.js) if there are other JS files
            if (otherJsFiles.length > 0) {
                const indexOtherFiles = [...indexJsFiles, ...otherJsFiles];
                const indexOtherSizeResults = await this.calculateSizes(indexOtherFiles, compression);
                this.results[`${componentName}/index.js + other JS`] = this.compareSizes(
                    indexOtherSizeResults,
                    `${componentName}/index.js + other JS`,
                    baselineSizes,
                    { maxSize, warnOnIncrease }
                );
            }
        }

        this.outputResults();
        await this.updateBaseline(baselineFile);

        if (this.hasWarnings) {
            await this.outputFailureReport();
            console.error(this.chalk.red('One or more components exceeded size thresholds.'));
            return false;
        } else {
            console.log(this.chalk.green('All components are within size thresholds.'));
            return true;
        }
    }
}

export default BundleSizeAnalyser;
