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
        if(document.getElementById('Dashboard.Navbar.Elements') != undefined) {
            const navbar = document.getElementById('Dashboard.Navbar.Elements');
    
            // Add Home
            navbar.innerHTML += `
            <li class="nav-item">
                <a class="nav-link" href="/dashboard" >
                    <span class="nav-link-icon d-md-none d-lg-inline-block"><!-- Download SVG icon from http://tabler-icons.io/i/home -->
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l-2 0l9 -9l9 9l-2 0" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7" /><path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6" /></svg></span>
                    <span class="nav-link-title">${i18next.t('Dashboard.Header.Navbar.Home')}</span>
                </a>
            </li>`
        }
});