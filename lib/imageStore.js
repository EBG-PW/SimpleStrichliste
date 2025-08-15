const fs = require('node:fs');
const path = require('node:path');

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
 * @returns 
 */
const readImage = async (route, filename, filetype) => {
    const filePath = path.join(storagePath, route, filename);
    try {
        return await fs.promises.readFile(`${filePath}.${filetype}`);
    } catch (error) {
        console.error('Error reading image file:', error);
        throw new Error('Image not found');
    }
};

/**
 * Delete an image from the file system
 * @param {string} route 
 * @param {string} filename 
 * @param {string} filetype 
 */
const deleteImage = async (route, filename, filetype) => {
    const filePath = path.join(storagePath, route, filename);
    try {
        await fs.promises.unlink(`${filePath}.${filetype}`);
    } catch (error) {
        console.error('Error deleting image file:', error);
        throw new Error('Image not found');
    }
};

module.exports = {
    writeImage,
    readImage,
    deleteImage
};
