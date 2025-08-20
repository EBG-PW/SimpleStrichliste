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


        // Add Home
        navbarmobile.innerHTML += `<a href="/" class="block py-2 text-gray-600 hover:text-blue-500">${i18next.t('Navbar.Overview')}</a>`
        navbardesktop.innerHTML += `<a href="/" class="text-gray-600 hover:text-blue-500">${i18next.t('Navbar.Overview')}</a>`

        if (checkPermission('app.user.history.*').result) {
            navbarmobile.innerHTML += `<a href="/transaction_history" class="block py-2 text-gray-600 hover:text-blue-500">${i18next.t('Navbar.Purchase_history')}</a>`
            navbardesktop.innerHTML += `<a href="/transaction_history" class="text-gray-600 hover:text-blue-500">${i18next.t('Navbar.Purchase_history')}</a>`
        }

        if (checkPermission('app.user.settings.*').result) {
            navbarmobile.innerHTML += `<a href="/settings" class="block py-2 text-gray-600 hover:text-blue-500">${i18next.t('Navbar.Settings')}</a>`
            navbardesktop.innerHTML += `<a href="/settings" class="text-gray-600 hover:text-blue-500">${i18next.t('Navbar.Settings')}</a>`
        }

        if (checkPermission('app.admin.*').result) {
            navbarmobile.innerHTML += `<a href="/admin/index" class="block py-2 text-gray-600 hover:text-blue-500">${i18next.t('Navbar.Admin')}</a>`;
            navbardesktop.innerHTML += `<a href="/admin/index" class="text-gray-600 hover:text-blue-500">${i18next.t('Navbar.Admin')}</a>`;
        }
    }
});

const capitalizeFirstLetter = (string) => {
    return string.charAt(0).toUpperCase() + string.slice(1);
}