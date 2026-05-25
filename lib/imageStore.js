const fs = require('node:fs');
const path = require('node:path');
const { findAllFilePaths, resizeManifestIcons } = require('@lib/utils');
const { FilesystemError } = require('@lib/errors')

const storagePath = path.join(__dirname, '..', 'storage');
// Ensure the storage directory exists
fs.mkdirSync(storagePath, { recursive: true });

/**
 * Save an image to the file system
 * @param {Buffer} buffer 
 * @param {string} route 
 * @param {string} filename 
 * @param {string} filetype 
 * @returns 
 */
const writeImage = async (buffer, route, filename, filetype) => {
    const filePath = path.join(storagePath, route, filename);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(`${filePath}.${filetype}`, buffer);
    return filePath;
};

/**
 * Read an image from the file system
 * @param {string} route 
 * @param {string} filename 
 * @param {string} filetype 
 * @param {boolean} as_stream
 * @returns 
 */
const readImage = async (route, filename, filetype, as_stream) => {
    const filePath = path.join(storagePath, route, filename);
    const fileWithType = `${filePath}.${filetype}`;
    if (!fs.existsSync(fileWithType)) throw new FilesystemError('Image not found');
    if (as_stream) {
        return fs.createReadStream(fileWithType);
    }
    return await fs.promises.readFile(fileWithType);
};

/**
 * Delete an image from the file system
 * @param {string} route 
 * @param {string} filename 
 * @param {string} filetype 
 */
const deleteImage = async (route, filename, filetype) => {
    const filePath = path.join(storagePath, route, filename);
    const fileWithType = `${filePath}.${filetype}`;
    if(!fs.existsSync(fileWithType)) throw new FilesystemError('Image not found');
    await fs.promises.unlink(fileWithType);
};

/**
 * Copies all files from the storagePath to the tempPath with progress logging.
 * @param {string} sourceDir
 * @param {string} targetDir
 * @returns {Promise<void>} A promise that resolves when all files are copied.
 */
const copyAllImages = async (sourceDir, targetDir) => {
    if(!fs.existsSync(sourceDir) || !fs.existsSync(targetDir)) throw new Error('Source directory or target directory does not exist');
    process.log.system(`Starting copy from ${sourceDir} to ${targetDir}...`);

    let copiedCount = 0;
    const routes = ['items', 'static'];
    const filePaths = [];

    routes.forEach((route) => {
        const sourceRouteDir = path.join(sourceDir, route);
        const targetRouteDir = path.join(targetDir, route);

        if (!fs.existsSync(sourceRouteDir)) fs.mkdirSync(sourceRouteDir, { recursive: true });
        if (!fs.existsSync(targetRouteDir)) fs.mkdirSync(targetRouteDir, { recursive: true });
    });

    for (const route of routes) {
        const sourceRouteDir = path.join(sourceDir, route);
        const routeFilePaths = await findAllFilePaths(sourceRouteDir);
        filePaths.push(...routeFilePaths.map((filePath) => ({ route: route, path: filePath })));
    }

    const totalCount = filePaths.length;
    if (totalCount === 0) {
        process.log.system('Image Copy: No files to copy');
        return;
    }

    // Start progress logger
    const progressLogger = setInterval(() => {
        const percentage = totalCount > 0 ? (copiedCount / totalCount) * 100 : 100;
        process.log.system(`Image Copy: Progress: ${copiedCount} / ${totalCount} files copied (${percentage.toFixed(2)}%)`);
    }, 1000);

    try {
        for (const file of filePaths) {
            const sourceRouteDir = path.join(sourceDir, file.route);
            const targetRouteDir = path.join(targetDir, file.route);
            const relativePath = path.relative(sourceRouteDir, file.path);
            const destPath = path.join(targetRouteDir, relativePath);
            await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
            await fs.promises.copyFile(file.path, destPath);
            copiedCount++;
        }
    } catch (err) {
        process.log.error('Image Copy: Error during file copy:', err);
        clearInterval(progressLogger);
        throw err;
    }

    clearInterval(progressLogger);
    process.log.system(`Image Copy: Copy complete: ${copiedCount} / ${totalCount} files copied.`);
};

const writefavicon = async (buffer) => {
    const publicPath = path.join(__dirname, '..', 'public');
    const iconsPath = path.join(publicPath, 'icons');
    const faviconPath = path.join(publicPath, 'favicon.ico');
    const icon192Path = path.join(iconsPath, 'icon-192.png');
    const icon512Path = path.join(iconsPath, 'icon-512.png');

    fs.mkdirSync(iconsPath, { recursive: true });

    const icons = await resizeManifestIcons(buffer);

    await fs.promises.writeFile(faviconPath, icons.favicon);
    await fs.promises.writeFile(icon192Path, icons.icon192);
    await fs.promises.writeFile(icon512Path, icons.icon512);

    return faviconPath;
};

module.exports = {
    writeImage,
    readImage,
    deleteImage,
    copyAllImages,
    writefavicon
};
