const updateElementText = (element, newText) => {
    if (element.hasChildNodes()) {
        let hasOnlyTextNodes = Array.from(element.childNodes).every(node => node.nodeType === Node.TEXT_NODE);

        if (hasOnlyTextNodes) {
            // If all child nodes are text, replace the whole text content
            element.textContent = newText;
        } else {
            // If there are mixed nodes, replace only the direct text node
            let textNode = Array.from(element.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
            if (textNode) textNode.nodeValue = newText;
        }
    } else {
        // If no child nodes, just update the text content
        element.textContent = newText;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    console.log("Translate starting DOM translation...");
    /* Translate all elements marked with spesific html tags */
    document.querySelectorAll("[data-translate]").forEach((element) => {
        const key = element.getAttribute("data-translate");
        if (key) {
            updateElementText(element, i18next.t(key));
        }
    });

    // Translate placeholders
    document.querySelectorAll("[data-translate-placeholder]").forEach((element) => {
        const key = element.getAttribute("data-translate-placeholder");
        if (key) {
            element.setAttribute('placeholder', i18next.t(key));
        }
    });

    // Translate title
    document.querySelectorAll("[data-translate-title]").forEach((element) => {
        const key = element.getAttribute("data-translate-title");
        if (key) {
            element.setAttribute('title', i18next.t(key));
        }
    });

    /* Generate a translated layout */
    if (localStorage.getItem('user_group') != undefined) {
        if (document.getElementById('Dashboard.Profile.User_Group') != undefined) {
            document.getElementById('Dashboard.Profile.User_Group').innerHTML = i18next.t(`User_Groups.${localStorage.getItem('user_group')}`);
        }
    }

    // Generate Navbar
    if (document.getElementById('mobile-menu') != undefined) {
        const navbarmobile = document.getElementById('mobile-menu');
        const navbardesktop = document.getElementById('desktop-menu');


        const addNavLink = (href, label) => {
            const mobileLink = document.createElement('a');
            mobileLink.href = href;
            mobileLink.className = 'block py-2 text-gray-600 hover:text-blue-500';
            mobileLink.textContent = label;
            navbarmobile.appendChild(mobileLink);

            const desktopLink = document.createElement('a');
            desktopLink.href = href;
            desktopLink.className = 'text-gray-600 hover:text-blue-500';
            desktopLink.textContent = label;
            navbardesktop.appendChild(desktopLink);
        };

        // Add Home
        addNavLink('/', i18next.t('Navbar.Overview'));

        if (checkPermission('app.user.history.*').result) {
            addNavLink('/transaction_history', i18next.t('Navbar.Purchase_history'));
        }

        if (checkPermission('app.user.settings.*').result) {
            addNavLink('/settings', i18next.t('Navbar.Settings'));
        }

        if (typeof features !== 'undefined') {
            Object.entries(features)
                .map(([featureName, feature]) => ({
                    name: featureName,
                    config: typeof feature === 'object' ? feature : {},
                }))
                .filter(({ config }) => config.navbar?.insert === true)
                .filter(({ config }) => !config.navbar.permission || checkPermission(config.navbar.permission).result)
                .sort((left, right) => (left.config.navbar.order || 100) - (right.config.navbar.order || 100))
                .forEach(({ name, config }) => {
                    const href = config.navbar.href || `/${name}`;
                    const translationKey = config.navbar.translationKey || `Navbar.Features.${name}`;
                    addNavLink(href, i18next.t(translationKey));
                });
        }

        if (checkPermission('app.admin.*').result) {
            addNavLink('/admin/index', i18next.t('Navbar.Admin'));
        }
    }
});

const t = (key, options) => {
    if (typeof i18next !== 'undefined' && i18next.t) {
        return i18next.t(key, options);
    }
    return key;
};

const capitalizeFirstLetter = (string) => {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

let messageTimeout;

/**
 * Show a consistent toast message on every page.
 * Existing #message-box elements are reused; otherwise one is created.
 * @param {String} text
 * @param {'success'|'error'} type
 */
const showMessage = (text, type = 'success') => {
    let messageBox = document.getElementById('message-box');

    if (!messageBox) {
        const container = document.createElement('div');
        container.id = 'message-box-container';
        container.className = 'fixed bottom-5 right-5 z-[9999] w-full max-w-xs px-4';

        messageBox = document.createElement('div');
        messageBox.id = 'message-box';
        messageBox.className = 'hidden';

        container.appendChild(messageBox);
        document.body.appendChild(container);
    } else {
        messageBox.parentElement?.classList.add('z-[9999]');
    }

    clearTimeout(messageTimeout);
    messageBox.textContent = text;
    messageBox.className = `mt-4 rounded-lg p-4 shadow-lg ${
        type === 'success'
            ? 'bg-green-100 text-green-800'
            : 'bg-red-100 text-red-800'
    }`;
    messageBox.classList.remove('hidden');

    messageTimeout = setTimeout(() => {
        messageBox.classList.add('hidden');
    }, 4000);
};

/**
 * Construct a localized message from a Joi validation error response.
 * @param {Object} errorResponse
 * @param {String|Function} fieldTranslation
 * @returns {String|null}
 */
const translateValidationError = (errorResponse, fieldTranslation = '') => {
    if (errorResponse?.message !== 'ValidationError' || !Array.isArray(errorResponse.reason)) return null;

    const detail = errorResponse.reason[0];
    if (!detail?.type) return null;

    const fieldName = detail.path?.[0] ?? detail.context?.key ?? '';
    let field = fieldName;

    if (typeof fieldTranslation === 'function') {
        field = fieldTranslation(fieldName, detail);
    } else if (fieldTranslation && fieldName) {
        field = t(`${fieldTranslation}.${capitalizeFirstLetter(String(fieldName))}`);
    }

    const context = detail.context || {};
    return t(`Error.Joi.${detail.type}`, {
        ...context,
        field,
        valids: Array.isArray(context.valids) ? context.valids.join(', ') : context.valids,
    });
};

/**
 * Translate a structured API error while retaining its generic English fallback.
 * @param {Object} errorResponse
 * @param {String|Function} fieldTranslation
 * @returns {String}
 */
const translateApiError = (errorResponse, fieldTranslation = '') => {
    if (errorResponse?.translationKey) return t(errorResponse.translationKey);

    const validationMessage = translateValidationError(errorResponse, fieldTranslation);
    if (validationMessage) return validationMessage;

    const errorKey = errorResponse?.message ? `Error.${errorResponse.message}` : '';
    if (errorKey && typeof i18next !== 'undefined' && i18next.exists?.(errorKey)) {
        return t(errorKey);
    }

    return errorResponse?.message || t('Error.UnknownError');
};
