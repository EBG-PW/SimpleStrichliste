const fs = require('node:fs');
const path = require('node:path');

const legalPagesConfigPath = path.join(__dirname, '..', 'storage', 'config', 'legal-pages.json');

const defaultLegalPages = {
    imprintHtml: '',
    privacyHtml: '',
};

const normalizeLegalPages = (pages = {}) => ({
    imprintHtml: typeof pages.imprintHtml === 'string' ? pages.imprintHtml : '',
    privacyHtml: typeof pages.privacyHtml === 'string' ? pages.privacyHtml : '',
});

const getLegalPages = () => {
    if (!fs.existsSync(legalPagesConfigPath)) return { ...defaultLegalPages };

    try {
        return normalizeLegalPages(JSON.parse(fs.readFileSync(legalPagesConfigPath, 'utf8')));
    } catch (error) {
        process.log?.error?.(`Failed to read legal page config: ${error.message}`);
        return { ...defaultLegalPages };
    }
};

const saveLegalPages = (pages) => {
    const normalizedPages = normalizeLegalPages(pages);
    const configDir = path.dirname(legalPagesConfigPath);
    fs.mkdirSync(configDir, { recursive: true });

    const tempPath = `${legalPagesConfigPath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(normalizedPages, null, 2)}\n`, 'utf8');
    fs.renameSync(tempPath, legalPagesConfigPath);

    return normalizedPages;
};

module.exports = {
    getLegalPages,
    saveLegalPages,
};
