
# CompSizer

CompSizer is a tool designed to analyze the size of component bundles in your project. It helps you ensure your component sizes are within acceptable limits by comparing them against baselines and showing size increases across builds. You can also configure gzip and Brotli compression checks.

## Features
- Analyze the size of individual component bundles.
- Compare sizes against baseline sizes.
- Warn when size exceeds configured thresholds.
- Supports gzip and Brotli compression analysis.

## Installation

You can install `CompSizer` locally in your project.

### Local Installation

```bash
npm install compsizer --save-dev
```

Once installed, you can use the command `compsizer` in your project.

## Usage

You can run the tool from the command line either with the default configuration file or by specifying a custom configuration file.

### Default Command

If you use the default configuration file name `bundle-size.config.json`, simply run:

```bash
npx compsizer
```

### Custom Configuration

If your configuration file is located elsewhere or has a different name, use:

```bash
npx compsizer --config path/to/your-config-file.json
```

### Example in `package.json`

You can add a script in your `package.json` for convenience:

```json
{
  "scripts": {
    "analyze-bundles": "compsizer --config path/to/your-config-file.json"
  }
}
```

Then run it via:

```bash
npm run analyze-bundles
```

## Configuration

You need to create a configuration file (default: `bundle-size.config.json`) that specifies the inclusion/exclusion patterns for files, size limits, and compression options.

### Example Configuration (`bundle-size.config.json`)

```json
{
  "exclude": ["src/**/*.test.js"],
  "compression": {
    "gzip": true,
    "brotli": true
  },
  "baselineFile": "baseline.json",
  "components": {
    "Button": {
      "maxSize": "20KB",
      "warnOnIncrease": "5%",
      "include": ["src/components/Button/**/*.js"],
      "exclude": []
    },
    "Modal": {
      "maxSize": "50KB",
      "warnOnIncrease": "10%",
      "include": ["src/components/Modal/**/*.js"],
      "exclude": []
    }
  },
  "defaults": {
    "warnOnIncrease": "5%"
  }
}
```

### Configuration Fields

- **exclude**: (array) Glob patterns to exclude certain files from analysis.
- **compression**: (object) Specify whether to calculate gzip and Brotli compressed sizes.
  - `gzip`: (boolean) Set to `true` to calculate gzip sizes.
  - `brotli`: (boolean) Set to `true` to calculate Brotli sizes.
- **baselineFile**: (string) Path to the JSON file where the baseline sizes are stored.
- **components**: (object) Configuration for each component.
  - `maxSize`: (string) The maximum allowable size for the component (e.g., `20KB`, `500KB`).
  - `warnOnIncrease`: (string) Warn if the size increases by more than the specified percentage.
  - `include`: (array) Glob patterns specific to the component to include.
  - `exclude`: (array) Glob patterns specific to the component to exclude. (Overrides the base exclude)
- **defaults**: (object) Default settings that apply to all components.
  - `warnOnIncrease`: (string) Default warning threshold for size increases.

## Output

The tool generates a report of the component sizes, whether they exceed limits, and how they compare to baseline sizes. It also updates the baseline file after each run.

Example output:

```bash
Component Bundle Sizes Report

Component: Button
Total Size: 19.45 KB
Gzip Size: 5.12 KB
Brotli Size: 4.01 KB
Within max size limit of 20KB
Size increase of 4.8% since last recorded size is within threshold of 5%

Component: Modal
Total Size: 48.78 KB
Gzip Size: 12.34 KB
Brotli Size: 10.24 KB
Within max size limit of 50KB
Size increase of 2.5% since last recorded size is within threshold of 10%
```

If any component exceeds its size threshold or size increase percentage, the tool will print a warning and exit with a non-zero status code.

## License

This project is licensed under the MIT License.
