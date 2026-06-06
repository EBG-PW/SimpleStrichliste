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
                    config: typeof feature === 'object' ? feature : { enabled: feature === true },
                }))
                .filter(({ config }) => config.enabled === true && config.navbar?.insert === true)
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
