const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const JSZip = require('jszip');

/**
 * Recursively merges enumerable properties from a source object into a target object.
 *
 * Plain nested objects are merged in place. Arrays and all non-object values replace
 * the existing target value instead of being concatenated or recursively merged.
 *
 * @template {Record<string, any>} T
 * @param {T} target Object that will be mutated and receive the merged properties.
 * @param {Record<string, any>} source Object whose properties will be merged into target.
 * @returns {T} The same target object after merging.
 */
const deepMerge = (target, source) => {
    Object.entries(source || {}).forEach(([key, value]) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
                target[key] = {};
            }
            deepMerge(target[key], value);
        } else {
            target[key] = value;
        }
    });
    return target;
};

/**
 * Generate a unique url path for one time tokens
 * @param {Number} length 
 */
const generateUrlPath = (length = 128) => {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

/**
 * Get the true IP of the request, considering proxy headers and configuration.
 * @param {Object} req - The HTTP request object.
 * @returns {string} The determined IP address of the request.
 */
const warnedProxyIssues = new Set();

/**
 * Get the first value from a header, whether it's a string or an array.
 * @param {String|Array} value - The header value(s) to process.
 * @returns {String} The first header value.
 */
const firstHeaderValue = (value) => {
    if (Array.isArray(value)) return value[0];
    return value;
}

/**
 * Get the first forwarded IP from a header value.
 * @param {String|Array} value - The header value(s) to process.
 * @returns {String} The first forwarded IP.
 */
const firstForwardedIp = (value) => {
    const header = firstHeaderValue(value);
    if (typeof header !== 'string') return header;
    return header.split(',')[0].trim();
}

/**
 * Warns about a proxy issue only once.
 * @param {string} key - The unique key for the warning.
 * @param {string} message - The warning message to log.
 */
const warnProxyIssueOnce = (key, message) => {
    if (warnedProxyIssues.has(key)) return;
    warnedProxyIssues.add(key);
    process.log?.warn?.(message);
}

/**
 * Get the configured proxy chain from environment variables.
 * @returns {Array<string>} An array of configured proxy types.
 */
const getProxyChain = () => {
    const configuredProxy = String(process.env.PROXY || 'none')
        .toLowerCase()
        .split(',')
        .map((proxy) => proxy.trim())
        .filter(Boolean);

    if (configuredProxy.length === 0 || configuredProxy.includes('none')) return [];

    const unknownProxyValues = configuredProxy.filter((proxy) => !['cf', 'proxy'].includes(proxy));
    if (unknownProxyValues.length > 0) {
        warnProxyIssueOnce(
            `proxy-config-unknown-${unknownProxyValues.join('-')}`,
            `Unknown PROXY value "${unknownProxyValues.join(',')}". Valid values: none, proxy, cf, cf,proxy. Ignoring unknown values.`
        );
    }

    return configuredProxy.filter((proxy) => ['cf', 'proxy'].includes(proxy));
}

/**
 * Get the true IP of the request
 * @param {Object} req - The HTTP request object.
 * @returns {string} The determined IP address of the request.
 */
const getIpOfRequest = (req) => {
    const headers = req.headers || {};
    const proxyChain = getProxyChain();
    const usesCloudflare = proxyChain.includes('cf');
    const usesProxy = proxyChain.includes('proxy');
    const cloudflareIp = firstHeaderValue(headers['cf-connecting-ip']);
    const forwardedIp = firstForwardedIp(headers['x-forwarded-for']);
    const fallbackIp = req.ip;

    let IP = fallbackIp;
    let source = 'req.ip';

    if (cloudflareIp) {
        IP = cloudflareIp;
        source = 'CF-Connecting-IP';
    } else if (forwardedIp) {
        IP = forwardedIp;
        source = 'X-Forwarded-For';
    }

    if (usesCloudflare && !cloudflareIp) {
        if (forwardedIp) {
            warnProxyIssueOnce(
                'cloudflare-missing-cf-header-with-forwarded',
                'PROXY includes "cf" but CF-Connecting-IP is missing while X-Forwarded-For is present. Using first X-Forwarded-For IP as fallback; check Cloudflare forwards CF-Connecting-IP.'
            );
        } else {
            warnProxyIssueOnce(
                'cloudflare-missing-proxy-headers',
                'PROXY includes "cf" but no CF-Connecting-IP or X-Forwarded-For header was received. Using req.ip; check Cloudflare/header forwarding or remove "cf" from PROXY.'
            );
        }
    }

    if (usesCloudflare && usesProxy && !forwardedIp) {
        warnProxyIssueOnce(
            'cloudflare-internal-proxy-missing-forwarded',
            'PROXY=cf,proxy expects an internal proxy after Cloudflare, but X-Forwarded-For is missing. Using CF-Connecting-IP; check internal proxy forwards X-Forwarded-For.'
        );
    }

    if (!usesCloudflare && usesProxy) {
        if (cloudflareIp) {
            warnProxyIssueOnce(
                'proxy-cloudflare-header',
                'PROXY=proxy but CF-Connecting-IP is present. Request looks like Cloudflare. Using CF-Connecting-IP; set PROXY=cf,proxy if Cloudflare forwards to an internal proxy.'
            );
        } else if (!forwardedIp) {
            warnProxyIssueOnce(
                'proxy-missing-proxy-headers',
                'PROXY=proxy but no X-Forwarded-For or CF-Connecting-IP header was received. Using req.ip; check reverse proxy headers or set PROXY=none.'
            );
        }
    }

    if (!usesCloudflare && !usesProxy && (cloudflareIp || forwardedIp)) {
        if (cloudflareIp) {
            warnProxyIssueOnce(
                'proxy-disabled-cloudflare-header',
                'Proxy headers received while PROXY=none. Using CF-Connecting-IP anyway; set PROXY=cf or PROXY=cf,proxy, or make the upstream strip spoofed client IP headers.'
            );
        } else {
            warnProxyIssueOnce(
                'proxy-disabled-forwarded-header',
                'Proxy headers received while PROXY=none. Using first X-Forwarded-For IP anyway; set PROXY=proxy, or make the upstream strip spoofed client IP headers.'
            );
        }
    }

    if (!IP) {
        warnProxyIssueOnce(
            'request-ip-missing',
            'Could not determine request IP: no proxy IP header and req.ip is empty. Rate limiting will use "unknown-ip".'
        );
        IP = 'unknown-ip';
    }

    return IP;
}

/**
 * Replacer function for JSON.stringify to convert BigInts to strings
 * @param {String} key 
 * @param {Any} value 
 * @returns 
 */
const bigIntReplacer = (key, value) => {
  return typeof value === 'bigint' ? value.toString() : value;
}

/**
 * Pass this function a stream and it will return a buffer once the stream has endet
 * @param {Stream} stream 
 * @returns {Promise<Buffer>}
 */
const streamToBuffer = (stream) => {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', chunk => {
            chunks.push(chunk);
        });
        stream.on('end', () => {
            resolve(Buffer.concat(chunks));
        });
        stream.on('error', err => {
            reject(err);
        });
    });
}

/**
 * Check if a buffer is a valid JPEG image and not too large (ENV: MAX_AVATAR_SIZE)
 * @param {Buffer} buffer
 * @param {Number} xPx | Maximum width of the image
 * @param {Number} yPx | Maximum height of the image
 * @returns {Promise<Boolean>}
 */
const verifyBufferIsJPG = async (buffer, xPx, yPx) => {
    const MAX_SIZE = (parseInt(process.env.MAX_AVATAR_SIZE_KB, 10) || 150) * 1024;
    const JPEG_SIGNATURES = [
        Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]),
        Buffer.from([0xFF, 0xD8, 0xFF, 0xE1]),
        Buffer.from([0xFF, 0xD8, 0xFF, 0xE8])
    ];

    // Check if the buffer is too large
    if (buffer.length > MAX_SIZE) {
        return false;
    }

    // Check if the buffer starts with a valid JPEG signature
    const isJPEG = JPEG_SIGNATURES.some(signature => {
        return buffer.subarray(0, 4).equals(signature);
    });

    if (!isJPEG) {
        return false;
    }

    try {
        const metadata = await sharp(buffer).metadata();

        // Check if the image is approximately square and within size limits
        const isSquare = Math.abs(metadata.width - metadata.height) / Math.max(metadata.width, metadata.height) <= 0.05;
        // Check if the image is within the size limits
        const isWithinSizeLimit = metadata.width <= xPx && metadata.height <= yPx;

        return isSquare && isWithinSizeLimit;
    } catch (err) {
        console.error("Error processing image with sharp:", err);
        return false;
    }
}

/**
 * Check if a buffer is a valid JPEG image and within max dimensions.
 * @param {Buffer} buffer
 * @param {Number} xPx
 * @param {Number} yPx
 * @returns {Promise<Boolean>}
 */
const verifyBufferIsJPGMaxDimensions = async (buffer, xPx, yPx) => {
    const JPEG_SIGNATURES = [
        Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]),
        Buffer.from([0xFF, 0xD8, 0xFF, 0xE1]),
        Buffer.from([0xFF, 0xD8, 0xFF, 0xE8])
    ];

    const isJPEG = JPEG_SIGNATURES.some(signature => {
        return buffer.subarray(0, 4).equals(signature);
    });

    if (!isJPEG) {
        return false;
    }

    try {
        const metadata = await sharp(buffer).metadata();
        return metadata.width <= xPx && metadata.height <= yPx;
    } catch (err) {
        console.error("Error processing image with sharp:", err);
        return false;
    }
}

/**
 * Converts an image buffer (JPEG or PNG) to a WebP buffer using Sharp.
 *
 * @param {Buffer} inputBuffer The buffer of the input image (JPEG or PNG).
 * @param {object} [options] Optional sharp webp output options.
 * @param {number} [options.quality=80] Quality, integer 1-100.
 * @param {boolean} [options.lossless=false] Use lossless compression.
 * @param {number} [options.effort=4] CPU effort to spend on compression, integer 0-6.
 * @returns {Promise<Buffer>} A promise that resolves with the WebP image buffer.
 * @throws {Error} Throws an error if the conversion fails.
 */
const convertToWebp = async (inputBuffer, options = {}) => {
    try {
        // Default options for WebP conversion
        const webpOptions = {
            quality: options.quality || 80,
            lossless: options.lossless || false,
            effort: options.effort || 4
        };

        const webpBuffer = await sharp(inputBuffer)
            .webp(webpOptions)
            .toBuffer();

        return webpBuffer;

    } catch (error) {
        console.error('Error during image conversion to WebP:', error);
        throw new Error('Failed to convert image to WebP.');
    }
}

const createIcoFromPng = (pngBuffer, size) => {
    const headerSize = 6;
    const directoryEntrySize = 16;
    const imageOffset = headerSize + directoryEntrySize;
    const icoBuffer = Buffer.alloc(imageOffset + pngBuffer.length);

    icoBuffer.writeUInt16LE(0, 0);
    icoBuffer.writeUInt16LE(1, 2);
    icoBuffer.writeUInt16LE(1, 4);
    icoBuffer.writeUInt8(size >= 256 ? 0 : size, 6);
    icoBuffer.writeUInt8(size >= 256 ? 0 : size, 7);
    icoBuffer.writeUInt8(0, 8);
    icoBuffer.writeUInt8(0, 9);
    icoBuffer.writeUInt16LE(1, 10);
    icoBuffer.writeUInt16LE(32, 12);
    icoBuffer.writeUInt32LE(pngBuffer.length, 14);
    icoBuffer.writeUInt32LE(imageOffset, 18);
    pngBuffer.copy(icoBuffer, imageOffset);

    return icoBuffer;
};

const resizePngIcon = async (buffer, size) => {
    return sharp(buffer)
        .resize(size, size, { fit: 'cover' })
        .png()
        .toBuffer();
};

/**
 * Resize a validated JPG app icon into all public manifest icon sizes.
 * @param {Buffer} buffer
 * @returns {Promise<{favicon: Buffer, icon192: Buffer, icon512: Buffer}>}
 */
const resizeManifestIcons = async (buffer) => {
    const faviconPng = await resizePngIcon(buffer, 48);
    const icon192 = await resizePngIcon(buffer, 192);
    const icon512 = await resizePngIcon(buffer, 512);

    return {
        favicon: createIcoFromPng(faviconPng, 48),
        icon192: icon192,
        icon512: icon512
    };
};

/**
 * Recursively finds all file paths within a directory.
 * @param {string} dir - The directory to scan.
 * @returns {Promise<string[]>} A promise that resolves to an array of full file paths.
 */
const findAllFilePaths = async (dir) => {
    let allFiles = [];
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            allFiles = allFiles.concat(await findAllFilePaths(entryPath));
        } else {
            allFiles.push(entryPath);
        }
    }
    return allFiles;
};

/**
 * Zips the entire contents of a directory and saves it to the backup path.
 * @param {string} sourceDir
 * @param {string} backupDir
 * @param {string} timestamp
 * @returns {Promise<string>}
 */
const zipDirectory = async (sourceDir, backupDir, timestamp) => {
    const zipFilename = `${timestamp}.zip`;
    const zipFilePath = path.join(backupDir, zipFilename);

    process.log.system(`Zipping contents of ${sourceDir} to ${zipFilePath}...`);

    try {
        await fs.promises.mkdir(backupDir, { recursive: true });

        const zip = new JSZip();
        const filePaths = await findAllFilePaths(sourceDir);

        if (filePaths.length === 0) {
            process.log.warn(`Source directory ${sourceDir} is empty. Creating an empty zip file.`);
        }

        // Add all files to the zip
        for (const filePath of filePaths) {
            const relativePath = path.relative(sourceDir, filePath);
            const zipPath = relativePath.replace(/\\/g, '/'); 
            const content = await fs.promises.readFile(filePath);
            zip.file(zipPath, content);
        }

        const zipBuffer = await zip.generateAsync({
            type: 'nodebuffer',
            compression: 'DEFLATE',
            compressionOptions: {
                level: 9
            }
        });

        await fs.promises.writeFile(zipFilePath, zipBuffer);

        process.log.system(`Archive created: ${zipFilename} (${zipBuffer.length} total bytes)`);
        return zipFilePath;

    } catch (err) {
        process.log.error('Error creating zip file:', err);
        throw err;
    }
};

/**
 * Asynchronously extracts a zip file to a target directory using JSZip.
 * @param {string} zipFilePath - Path to the .zip file.
 * @param {string} targetDir - Directory to extract contents to.
 * @returns {Promise<void>}
 */
const unzipDirectory = async (zipFilePath, targetDir) => {
    try {
        const data = await fs.promises.readFile(zipFilePath);
        const zip = await JSZip.loadAsync(data);
        const promises = [];
        zip.forEach((relativePath, zipEntry) => {
            if (zipEntry.dir) {
                const dirPath = path.join(targetDir, zipEntry.name);
                promises.push(fs.promises.mkdir(dirPath, { recursive: true }));
            } else {
                const filePath = path.join(targetDir, zipEntry.name);
                const dirName = path.dirname(filePath);
                
                promises.push(
                    fs.promises.mkdir(dirName, { recursive: true })
                        .then(() => {
                            return zipEntry.async('nodebuffer');
                        })
                        .then(content => {
                            return fs.promises.writeFile(filePath, content);
                        })
                );
            }
        });

        await Promise.all(promises);

    } catch (err) {
        throw new Error(`Failed to unzip file with JSZip: ${err.message}`);
    }
};

module.exports = {
    deepMerge: deepMerge,
    generateUrlPath: generateUrlPath,
    getIpOfRequest: getIpOfRequest,
    bigIntReplacer: bigIntReplacer,
    findAllFilePaths: findAllFilePaths,
    streamToBuffer: streamToBuffer,
    verifyBufferIsJPG: verifyBufferIsJPG,
    verifyBufferIsJPGMaxDimensions: verifyBufferIsJPGMaxDimensions,
    convertToWebp: convertToWebp,
    resizeManifestIcons: resizeManifestIcons,
    zipDirectory: zipDirectory,
    unzipDirectory: unzipDirectory
}
