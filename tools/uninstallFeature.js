const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.join(__dirname, '..');
const featureConfigDir = path.join(appRoot, 'config', 'features');
const installedFeaturesDir = path.join(appRoot, 'installed_features');
const localsMapPath = path.join(appRoot, 'config', 'locals_map.js');
const { removeLocalsMapEntries: subtractLocalsMapEntries } = require('../lib/features');

const featureName = process.argv[2];
const removeSource = process.argv.includes('--remove-source');

if (!featureName || !/^[a-zA-Z0-9_-]+$/.test(featureName)) {
    console.error('Usage: node tools/uninstallFeature.js <featureName> [--remove-source]');
    process.exit(1);
}

const resolveInsideAppRoot = (relativePath) => {
    const resolvedPath = path.normalize(path.join(appRoot, relativePath));
    const pathFromRoot = path.relative(appRoot, resolvedPath);
    if (pathFromRoot.startsWith('..') || path.isAbsolute(pathFromRoot)) {
        throw new Error(`Refusing to remove path outside app root: ${relativePath}`);
    }
    return resolvedPath;
};

const removeEmptyParents = (startDir) => {
    let currentDir = startDir;

    while (currentDir !== appRoot) {
        const pathFromRoot = path.relative(appRoot, currentDir);
        if (pathFromRoot.startsWith('..') || path.isAbsolute(pathFromRoot)) return;

        if (!fs.existsSync(currentDir)) {
            currentDir = path.dirname(currentDir);
            continue;
        }

        if (fs.readdirSync(currentDir).length > 0) return;
        fs.rmdirSync(currentDir);
        currentDir = path.dirname(currentDir);
    }
};

const configPath = path.join(featureConfigDir, `${featureName}.json`);
if (!fs.existsSync(configPath)) {
    console.error(`Feature '${featureName}' is not installed. Missing ${path.relative(appRoot, configPath)}.`);
    process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const removeLocalsMapEntries = (featureConfig) => {
    const featureLocalsMap = featureConfig.localsMap || {};
    if (Object.keys(featureLocalsMap).length === 0 || !fs.existsSync(localsMapPath)) return;

    delete require.cache[require.resolve(localsMapPath)];
    const localsMap = require(localsMapPath);

    const nextLocalsMap = subtractLocalsMapEntries(localsMap, featureLocalsMap);
    const sortedMap = Object.keys(nextLocalsMap).sort().reduce((result, route) => {
        result[route] = nextLocalsMap[route];
        return result;
    }, {});

    fs.writeFileSync(localsMapPath, `module.exports = ${JSON.stringify(sortedMap, null, 4)}\n`);
    console.log(`Updated config/locals_map.js for ${featureName}`);
};

removeLocalsMapEntries(config);

const installedFiles = Array.isArray(config.installedFiles) ? config.installedFiles : [];
const filesToRemove = [...new Set([...installedFiles, `config/features/${featureName}.json`])]
    .filter(relativePath => relativePath !== `config/locals_map.js:${featureName}`)
    .sort()
    .reverse();

filesToRemove.forEach(relativePath => {
    const targetPath = resolveInsideAppRoot(relativePath);

    if (!fs.existsSync(targetPath)) {
        console.log(`Skipped missing file: ${relativePath}`);
        return;
    }

    if (fs.statSync(targetPath).isDirectory()) {
        console.log(`Skipped directory from manifest: ${relativePath}`);
        return;
    }

    fs.unlinkSync(targetPath);
    console.log(`Removed ${relativePath}`);
    removeEmptyParents(path.dirname(targetPath));
});

if (removeSource) {
    const sourcePath = path.join(installedFeaturesDir, featureName);
    const resolvedSourcePath = path.normalize(sourcePath);
    const pathFromSourceRoot = path.relative(installedFeaturesDir, resolvedSourcePath);

    if (pathFromSourceRoot.startsWith('..') || path.isAbsolute(pathFromSourceRoot)) {
        throw new Error(`Refusing to remove source outside installed_features: ${sourcePath}`);
    }

    if (fs.existsSync(resolvedSourcePath)) {
        fs.rmSync(resolvedSourcePath, { recursive: true, force: true });
        console.log(`Removed source folder: ${path.relative(appRoot, resolvedSourcePath)}`);
    }
}

console.log(`Feature '${featureName}' uninstalled.`);
console.log('Database migrations are not rolled back automatically. Remove feature-owned database objects manually if required.');
