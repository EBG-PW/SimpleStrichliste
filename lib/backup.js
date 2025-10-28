const fs = require('node:fs');
const path = require('node:path');

const { copyAllImages } = require('@lib/imageStore');
const { zipDirectory, unzipDirectory } = require('@lib/utils');
const { backupDB, restoreDB } = require('@lib/sqlite/index');

/**
 * Returns a list of backup zips with sizes
 * @returns {Array<Object>}
 */
const getBackups = () => {
    const backupsDir = path.join(__dirname, '..', 'storage', 'backups');
    if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
    }

    return fs.readdirSync(backupsDir).filter(file => file.endsWith('.zip')).map(file => {
        const stats = fs.statSync(path.join(backupsDir, file));
        return { name: file, size: stats.size };
    });
};

/**
 * Orchestrates the backup creation process.
 */
const createBackup = async () => {
    const timestamp = new Date().getTime().toString();
    const tempPath = path.join(__dirname, '..', 'storage', `backup_${timestamp}`);

    try {
        process.log.system(`Preparing DB backup at temporary path: ${tempPath}`);
        fs.mkdirSync(tempPath, { recursive: true });
        await backupDB(tempPath);
        await copyAllImages(path.join(__dirname, '..', 'storage'), tempPath);

        const zipFilePath = await zipDirectory(tempPath, path.join(__dirname, '..', 'storage', 'backups'), timestamp);

        // Clean up temporary files
        fs.rmSync(tempPath, { recursive: true, force: true });
        process.log.system(`Temporary backup files cleaned up: ${tempPath}`);
        process.log.system(`Backup created successfully at: ${zipFilePath}`);
    } catch (err) {
        process.log.error('Error creating backup:', err);
        throw err;
    } finally {
        // Ensure temp directory is removed in case of error
        if (fs.existsSync(tempPath)) {
            fs.rmSync(tempPath, { recursive: true, force: true });
            process.log.system(`Cleaned up temp dir after error: ${tempPath}`);
        }
    }
};

/**
 * Orchestrates the restore process from an uploaded zip file.
 * @param {string} zipFilePath
 */
const restoreBackup = async (zipFilePath) => {
    const timestamp = new Date().getTime().toString();
    const unzipTempPath = path.join(__dirname, '..', 'storage', `restore_${timestamp}`);
    fs.mkdirSync(unzipTempPath, { recursive: true });
    process.log.system(`Unzipping backup to: ${unzipTempPath}`);

    try {
        await unzipDirectory(zipFilePath, unzipTempPath);
        process.log.system('Backup unzipped successfully.');

        const backupDbPath = path.join(unzipTempPath, 'application.db');
        const backupItemsSourceDir = unzipTempPath;
        const appStorageDir = path.join(__dirname, '..', 'storage');
        const appItemsDir = path.join(appStorageDir, 'items');

        if (!fs.existsSync(backupDbPath)) {
            throw new Error('Backup file is invalid: "application.db" not found.');
        }

        process.log.system('Restoring database...');
        await restoreDB(backupDbPath);
        process.log.system('Database restore complete.');

        process.log.system(`Clearing current images at: ${appItemsDir}`);
        fs.rmSync(appItemsDir, { recursive: true, force: true });
        process.log.system('Restoring images...');
        await copyAllImages(backupItemsSourceDir, appStorageDir);
        process.log.system('Image restore complete.');

    } catch (err) {
        process.log.error('Error during restore process:', err);
        throw err;
    } finally {
        if (fs.existsSync(unzipTempPath)) {
            fs.rmSync(unzipTempPath, { recursive: true, force: true });
            process.log.system(`Cleaned up restore temp dir: ${unzipTempPath}`);
        }
    }
};

module.exports = {
    getBackups,
    createBackup,
    restoreBackup
};