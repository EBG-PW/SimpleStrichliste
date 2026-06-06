const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.join(__dirname, '..');
const installedFeaturesDir = path.join(appRoot, 'installed_features');
const featureConfigDir = path.join(appRoot, 'config', 'features');
const featureLocalesDir = path.join(featureConfigDir, 'local');
const featureMigrationRoot = path.join(appRoot, 'migrations', 'features');
const featureSeedRoot = path.join(appRoot, 'seeds', 'features');
const localsMapPath = path.join(appRoot, 'config', 'locals_map.js');

const manifestCandidates = ['feature.json', 'config.json'];

const safeFeatureName = (name) => {
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
        throw new Error(`Invalid feature name: ${name}`);
    }
    return name;
};

const readJsonFile = (filePath) => {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const writeJsonFile = (filePath, data) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
};

const readLocalsMap = () => {
    delete require.cache[require.resolve(localsMapPath)];
    return require(localsMapPath);
};

const writeLocalsMap = (localsMap) => {
    const sortedMap = Object.keys(localsMap).sort().reduce((result, route) => {
        result[route] = localsMap[route];
        return result;
    }, {});
    fs.writeFileSync(localsMapPath, `module.exports = ${JSON.stringify(sortedMap, null, 4)}\n`);
};

const isPathInside = (parentPath, childPath) => {
    const relativePath = path.relative(parentPath, childPath);
    return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
};

const findSourceManifestPath = (featureDir) => {
    return manifestCandidates
        .map(candidate => path.join(featureDir, candidate))
        .find(candidatePath => fs.existsSync(candidatePath));
};

const normalizeManifest = (manifest, fallbackName) => {
    const name = safeFeatureName(manifest.name || fallbackName);
    return {
        ...manifest,
        name,
        version: manifest.version || '0.0.0',
        enabledByDefault: manifest.enabledByDefault === true,
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
        settings: {
            translationKeyBase: manifest.settings?.translationKeyBase || manifest.settingsTranslationKeyBase || `AdminSettings.Features.${name}`,
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

const resolveInsideAppRoot = (relativePath) => {
    const targetPath = path.normalize(path.join(appRoot, relativePath));
    if (!isPathInside(appRoot, targetPath)) {
        throw new Error(`Feature install path escapes app root: ${relativePath}`);
    }
    return targetPath;
};

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

const copyFeatureFiles = (featureDir, featureName, manifest) => {
    const installedFiles = [];
    const manifestFiles = new Set(manifestCandidates);

    fs.readdirSync(featureDir, { withFileTypes: true }).forEach(dirent => {
        if (manifestFiles.has(dirent.name) || dirent.name.startsWith('.')) return;

        const sourcePath = path.join(featureDir, dirent.name);
        let targetPath;

        if (dirent.name === 'local') {
            targetPath = path.join(featureLocalesDir);
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

const applyFeatureLocalsMap = (featureName, manifest) => {
    const featureLocalsMap = manifest.localsMap || {};
    if (Object.keys(featureLocalsMap).length === 0) return [];

    const localsMap = readLocalsMap();
    Object.entries(featureLocalsMap).forEach(([route, keys]) => {
        localsMap[route] = [...new Set([...(localsMap[route] || []), ...keys])];
    });
    writeLocalsMap(localsMap);

    return [`config/locals_map.js:${featureName}`];
};

const installFeatures = () => {
    fs.mkdirSync(installedFeaturesDir, { recursive: true });
    fs.mkdirSync(featureConfigDir, { recursive: true });
    fs.mkdirSync(featureLocalesDir, { recursive: true });

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

const getEnabledFeatures = (featureSettings) => {
    const featureDefinitions = loadFeatureDefinitions();
    return Object.entries(featureDefinitions).reduce((enabledFeatures, [featureName, definition]) => {
        if (featureSettings[featureName] === true) {
            enabledFeatures[featureName] = {
                ...definition,
                enabled: true,
            };
        }
        return enabledFeatures;
    }, {});
};

const getEnabledFeatureDefinitions = (featureSettings) => {
    const featureDefinitions = loadFeatureDefinitions();
    return Object.entries(featureDefinitions).reduce((enabledFeatureDefinitions, [featureName, definition]) => {
        if (featureSettings[featureName] === true) {
            enabledFeatureDefinitions[featureName] = definition;
        }
        return enabledFeatureDefinitions;
    }, {});
};

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
    featureLocalesDir,
    installFeatures,
    loadFeatureDefinitions,
    getEnabledFeatures,
    getEnabledFeatureDefinitions,
    getFeaturePublicFilePath,
    compareVersions,
};
