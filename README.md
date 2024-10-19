
# compsizer

`compsizer` is a tool designed to analyse the size of component bundles in your project. It helps you ensure that your component sizes are within acceptable limits by comparing them against baselines and showing size increases across builds. You can also configure gzip and Brotli compression checks.

## Features

- Analyse the size of individual component bundles.
- Compare sizes against baseline sizes.
- Warn when size exceeds configured thresholds.
- Supports gzip and Brotli compression analysis.

## Installation

You can install `compsizer` locally in your project.

### Local Installation

```bash
npm install compsizer --save-dev
```

Once installed, you can use the command `compsizer` in your project.

## Usage

You can run the tool from the command line either with the default configuration file or by specifying a custom configuration file.

### Default Command

If you use the default configuration file name `compsizer.config.json`, simply run:

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
    "analyse-component-bundles": "compsizer --config path/to/your-config-file.json"
  }
}
```

Then run it via:

```bash
npm run analyse-component-bundles
```

## Configuration

Each component package should have its own configuration file to specify the inclusion/exclusion patterns for files, size limits, and compression options.

**Note:** You can choose to place a single configuration file at the root of your repository and list all of your components in the `components` property together. However, please be aware that depending on how many components you add, it could take a while to generate the size reports for all of them at once.

### Example Configuration (placed in each component package, e.g., `modal/compsizer.config.json`)

```json
{
  "exclude": [
    "**/*.d.ts"
  ],
  "compression": {
    "gzip": true,
    "brotli": true
  },
  "baselineFile": "component-bundle-sizes.json",
  "components": {
    "modal": {
      "maxSize": "50 KB",
      "warnOnIncrease": "10%",
      "distFolderLocation": "./dist"
    },
    // You could add more components here if placing this config at the root of your project.
  },
  "defaults": {
    "warnOnIncrease": "5%"
  }
```

### Configuration Fields

- **exclude**: (array) Glob patterns to exclude certain files from analysis.
- **compression**: (object) Specify whether to calculate gzip and Brotli compressed sizes.
  - `gzip`: (boolean) Set to `true` to calculate gzip sizes.
  - `brotli`: (boolean) Set to `true` to calculate Brotli sizes.
- **baselineFile**: (string) Path to the JSON file where the baseline sizes are stored.
- **components**: (object) Configuration for each component. Each key corresponds to a component name.
  - `maxSize`: (string) The maximum allowable size for the component (e.g., `50KB`, `500KB`).
  - `warnOnIncrease`: (string) Warn if the size increases by more than the specified percentage.
  - `distFolderLocation`: (string) Path pointing to the built component files.
  - `exclude`: (array) Glob patterns specific to the component to exclude. (Overrides the base `exclude`)
- **defaults**: (object) Default settings that apply to all components.
  - `warnOnIncrease`: (string) Default warning threshold for size increases.

### Adding Config for Each Component

The configuration file (e.g., `compsizer.config.json`) should be added to **each component package** in your monorepo instead of the monorepo root. This allows for more granular control over component-specific size limits and compression options.

## Output

The tool generates a report of the component sizes, whether they exceed limits, and how they compare to baseline sizes. It also updates the baseline file after each run.

### Report Explanation

The report provides detailed size breakdowns for each component, including:

- **index.js size**: The size of the component’s `index.js` file.
- **index.js + react.js size**: If applicable, the combined size of the component’s `index.js` and `react.js` files, representing the core component and its React dependencies.
- **index.js + other JS files (e.g., polyfills)**: The combined size of `index.js` along with other JavaScript files, such as polyfills or additional module exports, providing a comprehensive overview of the total size of the component and its dependencies.

Example output:

```bash
Component Bundle Sizes Report

Component: modal/index.js
Total Size: 19.45 KB
Gzip Size: 5.12 KB
Brotli Size: 4.01 KB
Within max size limit of 50KB
Size increase of 4.8% since last recorded size is within threshold of 5%

Component: modal/index.js + react.js + other JS
Total Size: 48.78 KB
Gzip Size: 12.34 KB
Brotli Size: 10.24 KB
Within max size limit of 50KB
Size increase of 2.5% since last recorded size is within threshold of 10%
```

If any component exceeds its size threshold or size increase percentage, the tool will print a warning and exit with a non-zero status code.

## License

This project is licensed under the MIT License.
