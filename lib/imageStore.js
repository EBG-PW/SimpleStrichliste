const fs = require('node:fs');
const path = require('node:path');
const { findAllFilePaths } = require('@lib/utils');
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

    const sourceDirItems = path.join(sourceDir, 'items');
    const targetDirItems = path.join(targetDir, 'items');

    const filePaths = await findAllFilePaths(sourceDirItems);
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
        for (const srcPath of filePaths) {
            const relativePath = path.relative(sourceDirItems, srcPath);
            const destPath = path.join(targetDirItems, relativePath);
            await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
            await fs.promises.copyFile(srcPath, destPath);
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

module.exports = {
    writeImage,
    readImage,
    deleteImage,
    copyAllImages
};
