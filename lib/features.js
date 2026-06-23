const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.join(__dirname, '..');
const installedFeaturesDir = path.join(appRoot, 'installed_features');
const featureConfigDir = path.join(appRoot, 'config', 'features');
const featureMigrationRoot = path.join(appRoot, 'migrations', 'features');
const featureSeedRoot = path.join(appRoot, 'seeds', 'features');
const localsMapPath = path.join(appRoot, 'config', 'locals_map.js');
const coreVersion = require(path.join(appRoot, 'package.json')).version;

const manifestCandidates = ['feature.json', 'config.json'];

/**
 * @typedef {Object} FeatureManifest
 * @property {String} name Safe feature identifier used for settings, config files, and install paths.
 * @property {String} version Feature version used to decide whether an installed feature should be updated.
 * @property {String} minCoreVersion Minimum SimpleStrichliste version required by the feature.
 * @property {Object} navbar Navbar metadata used when a feature adds a navigation entry.
 * @property {Object} adminCard Admin feature-card metadata for the admin overview.
 * @property {Object} db Database migration and seed file references.
 * @property {Object.<String, String[]>} localsMap Extra translation keys needed by route.
 */

/**
 * Validates and returns a safe feature name.
 * @param {String} name 
 * @returns {String} The validated feature name.
 * @throws {Error} If the feature name is invalid.
 */
const safeFeatureName = (name) => {
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
        throw new Error(`Invalid feature name: ${name}`);
    }
    return name;
};

/**
 * Reads and parses a JSON file from the given path.
 * @param {String} filePath 
 * @returns {Object} The parsed JSON content.
 * @throws {Error} If the file cannot be read or parsed.
 */
const readJsonFile = (filePath) => {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

/**
 * Writes an object to a JSON file at the given path.
 * @param {String} filePath 
 * @param {Object} data 
 */
const writeJsonFile = (filePath, data) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
};

/**
 * Loads the route-to-translation-key map from config without using stale require cache data.
 * @returns {Object.<String, String[]>} The current locals map keyed by route path.
 */
const readLocalsMap = () => {
    delete require.cache[require.resolve(localsMapPath)];
    return require(localsMapPath);
};

/**
 * Writes the route-to-translation-key map back to config with stable route ordering.
 * @param {Object.<String, String[]>} localsMap The locals map to persist.
 */
const writeLocalsMap = (localsMap) => {
    const sortedMap = Object.keys(localsMap).sort().reduce((result, route) => {
        result[route] = localsMap[route];
        return result;
    }, {});
    fs.writeFileSync(localsMapPath, `module.exports = ${JSON.stringify(sortedMap, null, 4)}\n`);
};

/**
 * Appends feature route translation keys to an existing locals map.
 * Existing route keys are preserved and feature keys are deduplicated.
 * @param {Object.<String, String[]>} baseLocalsMap Existing core/application locals map.
 * @param {Object.<String, String[]>} additionalLocalsMap Feature-provided route additions.
 * @returns {Object.<String, String[]>} Merged locals map.
 */
const mergeLocalsMapEntries = (baseLocalsMap, additionalLocalsMap) => {
    const mergedLocalsMap = Object.entries(baseLocalsMap || {}).reduce((result, [route, keys]) => {
        result[route] = Array.isArray(keys) ? [...keys] : [];
        return result;
    }, {});

    Object.entries(additionalLocalsMap || {}).forEach(([route, keys]) => {
        if (!Array.isArray(keys)) return;
        const existingKeys = Array.isArray(mergedLocalsMap[route]) ? mergedLocalsMap[route] : [];
        mergedLocalsMap[route] = [...new Set([...existingKeys, ...keys])];
    });

    return mergedLocalsMap;
};

/**
 * Removes feature route translation keys from an existing locals map.
 * Routes are removed only when no translation keys remain after subtraction.
 * @param {Object.<String, String[]>} baseLocalsMap Existing application locals map.
 * @param {Object.<String, String[]>} removableLocalsMap Feature-provided route additions to remove.
 * @returns {Object.<String, String[]>} Locals map without the removable feature keys.
 */
const removeLocalsMapEntries = (baseLocalsMap, removableLocalsMap) => {
    const nextLocalsMap = Object.entries(baseLocalsMap || {}).reduce((result, [route, keys]) => {
        result[route] = Array.isArray(keys) ? [...keys] : [];
        return result;
    }, {});

    Object.entries(removableLocalsMap || {}).forEach(([route, keys]) => {
        if (!Array.isArray(keys) || !Array.isArray(nextLocalsMap[route])) return;

        const removableKeys = new Set(keys);
        nextLocalsMap[route] = nextLocalsMap[route].filter(key => !removableKeys.has(key));

        if (nextLocalsMap[route].length === 0) {
            delete nextLocalsMap[route];
        }
    });

    return nextLocalsMap;
};

/**
 * Checks whether a resolved child path is inside a resolved parent path.
 * @param {String} parentPath The directory that should contain the child path.
 * @param {String} childPath The path to validate.
 * @returns {Boolean} True when childPath is inside parentPath or equal to it.
 */
const isPathInside = (parentPath, childPath) => {
    const relativePath = path.relative(parentPath, childPath);
    return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
};

/**
 * Finds the first supported manifest filename in a feature source directory.
 * @param {String} featureDir Path to an installed_features/<feature> source directory.
 * @returns {String|undefined} Absolute path to feature.json/config.json, or undefined when missing.
 */
const findSourceManifestPath = (featureDir) => {
    return manifestCandidates
        .map(candidate => path.join(featureDir, candidate))
        .find(candidatePath => fs.existsSync(candidatePath));
};

/**
 * Normalizes a feature manifest by filling defaults and sanitizing route/locales/db metadata.
 * @param {Object} manifest Raw manifest data read from a feature.json/config.json file.
 * @param {String} fallbackName Directory name to use when the manifest has no name.
 * @returns {FeatureManifest} A complete manifest object with defaults applied.
 */
const normalizeManifest = (manifest, fallbackName) => {
    const name = safeFeatureName(manifest.name || fallbackName);
    return {
        ...manifest,
        name,
        version: manifest.version || '0.0.0',
        minCoreVersion: manifest.minCoreVersion || '0.0.0',
        navbar: {
            insert: manifest.navbar?.insert === true,
            href: manifest.navbar?.href || `/${name}`,
            translationKey: manifest.navbar?.translationKey || `Navbar.Features.${name}`,
            order: Number.isFinite(manifest.navbar?.order) ? manifest.navbar.order : 100,
            permission: manifest.navbar?.permission || null,
        },
        adminCard: {
            href: manifest.adminCard?.href || manifest.href || `/admin/${name}`,
            translationKeyBase: manifest.adminCard?.translationKeyBase || manifest.translationKeyBase || `Admin.FeatureCards.${name}`,
        },
        db: {
            migrations: Array.isArray(manifest.db?.migrations) ? manifest.db.migrations : [],
            seeds: Array.isArray(manifest.db?.seeds) ? manifest.db.seeds : [],
        },
        localsMap: manifest.localsMap && typeof manifest.localsMap === 'object' && !Array.isArray(manifest.localsMap)
            ? Object.entries(manifest.localsMap).reduce((routes, [route, keys]) => {
                if (route.startsWith('/') && Array.isArray(keys)) {
                    routes[route] = [...new Set(keys.filter(key => typeof key === 'string' && key.length > 0))];
                }
                return routes;
            }, {})
            : {},
    };
};

/**
 * Compares two dotted or dashed version strings.
 * @param {String} left First version string.
 * @param {String} right Second version string.
 * @returns {Number} 1 when left is newer, -1 when right is newer, 0 when equal.
 */
const compareVersions = (left, right) => {
    const parse = (version) => String(version || '0.0.0').split(/[.-]/).map(part => {
        const numeric = Number(part);
        return Number.isNaN(numeric) ? part : numeric;
    });

    const leftParts = parse(left);
    const rightParts = parse(right);
    const maxLength = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < maxLength; index += 1) {
        const leftPart = leftParts[index] ?? 0;
        const rightPart = rightParts[index] ?? 0;

        if (typeof leftPart === 'number' && typeof rightPart === 'number') {
            if (leftPart > rightPart) return 1;
            if (leftPart < rightPart) return -1;
            continue;
        }

        const textCompare = String(leftPart).localeCompare(String(rightPart));
        if (textCompare !== 0) return textCompare;
    }

    return 0;
};

/**
 * Checks whether a feature supports the currently running core application version.
 * @param {FeatureManifest} manifest
 * @returns {Boolean} True when the feature supports the running core version.
 */
const isCoreCompatible = (manifest) =>
    compareVersions(coreVersion, manifest.minCoreVersion) >= 0;

/**
 * Resolves a feature-provided relative install path and prevents writes outside the app root.
 * @param {String} relativePath Relative path from the application root.
 * @returns {String} Absolute normalized path inside the application root.
 * @throws {Error} If the resolved path would escape the application root.
 */
const resolveInsideAppRoot = (relativePath) => {
    const targetPath = path.normalize(path.join(appRoot, relativePath));
    if (!isPathInside(appRoot, targetPath)) {
        throw new Error(`Feature install path escapes app root: ${relativePath}`);
    }
    return targetPath;
};

/**
 * Recursively copies a file or directory and records every installed file path.
 * @param {String} sourcePath Source file or directory path.
 * @param {String} targetPath Destination file or directory path.
 * @param {String[]} installedFiles Mutable list receiving app-root-relative installed file paths.
 */
const copyRecursive = (sourcePath, targetPath, installedFiles) => {
    const stats = fs.statSync(sourcePath);

    if (stats.isDirectory()) {
        fs.mkdirSync(targetPath, { recursive: true });
        fs.readdirSync(sourcePath).forEach(child => {
            copyRecursive(path.join(sourcePath, child), path.join(targetPath, child), installedFiles);
        });
        return;
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    installedFiles.push(path.relative(appRoot, targetPath).split(path.sep).join('/'));
};

/**
 * Copies all installable files from a feature package into their application locations.
 * Special folders are routed to shared application locations:
 * locales -> config/locales, templates -> config/templates,
 * migrations -> migrations/features/<feature>, seeds -> seeds/features/<feature>.
 * Other top-level entries are copied relative to the app root.
 * @param {String} featureDir Source directory under installed_features.
 * @param {String} featureName Normalized feature name.
 * @param {FeatureManifest} manifest Manifest to update with discovered migrations/seeds.
 * @returns {String[]} App-root-relative file paths copied during installation.
 */
const copyFeatureFiles = (featureDir, featureName, manifest) => {
    const installedFiles = [];
    const manifestFiles = new Set(manifestCandidates);

    fs.readdirSync(featureDir, { withFileTypes: true }).forEach(dirent => {
        if (manifestFiles.has(dirent.name) || dirent.name.startsWith('.')) return;

        const sourcePath = path.join(featureDir, dirent.name);
        let targetPath;

        if (dirent.name === 'locales') {
            targetPath = path.join(appRoot, 'config', 'locales');
        } else if (dirent.name === 'templates') {
            targetPath = path.join(appRoot, 'config', 'templates');
        } else if (dirent.name === 'migrations') {
            targetPath = path.join(featureMigrationRoot, featureName);
            manifest.db.migrations = fs.readdirSync(sourcePath)
                .filter(file => file.endsWith('.sql'))
                .sort()
                .map(file => path.join('migrations', 'features', featureName, file).split(path.sep).join('/'));
        } else if (dirent.name === 'seeds') {
            targetPath = path.join(featureSeedRoot, featureName);
            manifest.db.seeds = fs.readdirSync(sourcePath)
                .filter(file => file.endsWith('.sql'))
                .sort()
                .map(file => path.join('seeds', 'features', featureName, file).split(path.sep).join('/'));
        } else {
            targetPath = resolveInsideAppRoot(dirent.name);
        }

        copyRecursive(sourcePath, targetPath, installedFiles);
    });

    return installedFiles;
};

/**
 * Merges a feature manifest's localsMap entries into config/locals_map.js.
 * @param {String} featureName Normalized feature name, used in the installed files marker.
 * @param {FeatureManifest} manifest Manifest that may contain route translation-key additions.
 * @returns {String[]} Installed file markers affected by this operation.
 */
const applyFeatureLocalsMap = (featureName, manifest) => {
    const featureLocalsMap = manifest.localsMap || {};
    if (Object.keys(featureLocalsMap).length === 0) return [];

    writeLocalsMap(mergeLocalsMapEntries(readLocalsMap(), featureLocalsMap));

    return [`config/locals_map.js:${featureName}`];
};

/**
 * Installs or updates feature packages from installed_features into the application.
 * A feature is copied only when its source manifest version is newer than the saved config manifest.
 * @returns {String[]} Installed or updated feature identifiers in name@version format.
 */
const installFeatures = () => {
    fs.mkdirSync(installedFeaturesDir, { recursive: true });
    fs.mkdirSync(featureConfigDir, { recursive: true });

    const installed = [];

    fs.readdirSync(installedFeaturesDir, { withFileTypes: true }).forEach(dirent => {
        if (!dirent.isDirectory() || dirent.name.startsWith('.')) return;

        const featureDir = path.join(installedFeaturesDir, dirent.name);
        const manifestPath = findSourceManifestPath(featureDir);
        if (!manifestPath) {
            process.log?.warn?.(`[FEATURES] Skipping ${dirent.name}: missing feature.json or config.json`);
            return;
        }

        const sourceManifest = normalizeManifest(readJsonFile(manifestPath), dirent.name);
        const installedConfigPath = path.join(featureConfigDir, `${sourceManifest.name}.json`);
        const currentManifest = fs.existsSync(installedConfigPath)
            ? normalizeManifest(readJsonFile(installedConfigPath), sourceManifest.name)
            : null;

        if (!isCoreCompatible(sourceManifest)) {
            const retainedVersion = currentManifest
                ? ` Existing installed version ${currentManifest.version} remains active.`
                : '';
            process.log?.error?.(
                `[FEATURES] Skipping ${sourceManifest.name}@${sourceManifest.version}: requires ` +
                `SimpleStrichliste ${sourceManifest.minCoreVersion} or newer; running ${coreVersion}.` +
                retainedVersion
            );
            return;
        }

        if (currentManifest && compareVersions(sourceManifest.version, currentManifest.version) <= 0) {
            return;
        }

        const installedFiles = [
            ...copyFeatureFiles(featureDir, sourceManifest.name, sourceManifest),
            ...applyFeatureLocalsMap(sourceManifest.name, sourceManifest),
        ];
        const nextManifest = {
            ...sourceManifest,
            installedFrom: path.relative(appRoot, featureDir).split(path.sep).join('/'),
            installedAt: new Date().toISOString(),
            installedFiles: [...new Set([...installedFiles, `config/features/${sourceManifest.name}.json`])].sort(),
        };

        writeJsonFile(installedConfigPath, nextManifest);
        installed.push(`${sourceManifest.name}@${sourceManifest.version}`);
    });

    if (installed.length > 0) {
        process.log?.system?.(`[FEATURES] Installed/updated features: ${installed.join(', ')}`);
    }

    return installed;
};

/**
 * Loads normalized feature definitions from config/features/*.json.
 * @returns {Object.<String, FeatureManifest>} Feature definitions keyed by feature name.
 */
const loadFeatureDefinitions = () => {
    if (!fs.existsSync(featureConfigDir)) return {};

    return fs.readdirSync(featureConfigDir)
        .filter(file => file.endsWith('.json'))
        .reduce((definitions, file) => {
            const featureName = safeFeatureName(path.basename(file, '.json'));
            definitions[featureName] = normalizeManifest(readJsonFile(path.join(featureConfigDir, file)), featureName);
            return definitions;
        }, {});
};

/**
 * Resolves a public asset path for an installed feature.
 * @param {String} featureName Feature name whose installed_features/<feature>/public directory should be used.
 * @param {String} publicPath Requested path relative to the feature's public directory.
 * @returns {String|null} Absolute file path when it exists, otherwise null.
 * @throws {Error} If featureName is invalid or publicPath escapes the feature public directory.
 */
const getFeaturePublicFilePath = (featureName, publicPath) => {
    const safeName = safeFeatureName(featureName);
    const baseDir = path.join(installedFeaturesDir, safeName, 'public');
    const targetPath = path.normalize(path.join(baseDir, publicPath));

    if (!isPathInside(baseDir, targetPath)) {
        throw new Error(`Feature public path escapes feature directory: ${publicPath}`);
    }

    return fs.existsSync(targetPath) ? targetPath : null;
};

module.exports = {
    installedFeaturesDir,
    featureConfigDir,
    installFeatures,
    loadFeatureDefinitions,
    getFeaturePublicFilePath,
    compareVersions,
    isCoreCompatible,
    mergeLocalsMapEntries,
    removeLocalsMapEntries,
};
