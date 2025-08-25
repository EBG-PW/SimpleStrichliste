const fs = require('node:fs');
const path = require('node:path');
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
    if (!fs.existsSync(filePath)) throw new FilesystemError('Image not found');
    if (as_stream) {
        return fs.createReadStream(`${filePath}.${filetype}`);
    }
    return await fs.promises.readFile(`${filePath}.${filetype}`);
};

/**
 * Delete an image from the file system
 * @param {string} route 
 * @param {string} filename 
 * @param {string} filetype 
 */
const deleteImage = async (route, filename, filetype) => {
    const filePath = path.join(storagePath, route, filename);
    if(!fs.existsSync(filePath)) throw new FilesystemError('Image not found');
    await fs.promises.unlink(`${filePath}.${filetype}`);
};

module.exports = {
    writeImage,
    readImage,
    deleteImage
};
