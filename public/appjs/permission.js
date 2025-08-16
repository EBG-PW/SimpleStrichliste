/**
 * @typedef {Object} PermissionResponse
 * @property {Boolean} result - True if the user has the permission
 * @property {String} reason - The reason for the result
 */

/**
 * [Route].[Endpoint].[Exact(Optional)]
 * It can use * to terminate early AND make all permissions below it true.
 * @param {String} required_permission 
 * @returns {PermissionResponse}
 */
const checkPermission = (required_permission) => {
  const user_permissions = JSON.parse(localStorage.getItem("permissions")) || [];

  let hasGeneralPermission = false;
  let specificDenySet = new Set();

  for (let perm of user_permissions) {
    // Check if the permission is explicitly set
    if (perm === required_permission) {
      return { result: true, reason: perm };
    }
    // Check if a global permission is present
    if (perm === "*") {
      hasGeneralPermission = true;
      continue;
    }
    // Check if the permission is a global permission
    if (perm.endsWith(".*")) {
      let basePerm = perm.slice(0, -2);
      if (required_permission.startsWith(basePerm)) {
        hasGeneralPermission = true;
      }
    }
    // If a .read denial is present, the .write denial is also added
    if (perm.endsWith(".read")) {
      specificDenySet.add(perm.replace(".read", ".write"));
    }
    // If a .write denial is present, the .read denial is also added
    if (perm.endsWith(".write")) {
      specificDenySet.add(perm.replace(".write", ".read"));
    }
  }

  if (specificDenySet.has(required_permission)) {
    return { result: false, reason: "Specifically restricted." };
  }

  if (hasGeneralPermission) {
    return { result: true, reason: "General permission granted." };
  }

  return { result: false, reason: "Not permitted." };
}

const checkSession = async () => {
  const token = localStorage.getItem("token");
  if (!token) {
    if(!window.location.href.includes("login") &&
      !window.location.href.includes("register") &&
      !window.location.href.includes("setup")) window.location.href = "/login";
    return { result: false, reason: "No token found." };
  }

  const response = await fetch("/api/v1/auth/check", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",

      "Authorization": "Bearer " + localStorage.getItem('token')
    },
  });
  if (response.status === 200) {
    const responseData = await response.json();

    localStorage.setItem("token", responseData.token);
    localStorage.setItem("uuid", responseData.uuid);
    localStorage.setItem("username", responseData.username);
    localStorage.setItem("email", responseData.email);
    localStorage.setItem("permissions", JSON.stringify(responseData.permissions));
    localStorage.setItem("language", responseData.language);

    if (window.location.href.includes("login")) window.location.href = "/overview";
  } else {
    localStorage.removeItem("token");
    localStorage.removeItem("uuid");
    localStorage.removeItem("username");
    localStorage.removeItem("email");
    localStorage.removeItem("permissions");
    localStorage.removeItem("language");
    // if(!window.location.href.includes("login") && !window.location.href.includes("register") && !window.location.href.includes("passwordreset")) window.location.href = "/login";
    throw new Error(response.statusText);
  }
}

// in a file like /appjs/api.js

/**
 * Wrapping fetch requests with automatic token handling.
 * @param {string} url The URL to fetch.
 * @param {object} options The options object for the fetch call.
 * @returns {Promise<Response>} A promise that resolves with the fetch Response.
 */
const apiFetch = (url, options = {}) => {
  const token = localStorage.getItem("token");
  if (token) {
    options.headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    };
  }

  return fetch(url, options).then(response => {
    if (response.status === 401) {
      localStorage.removeItem("token");
      window.location.replace("/login");
      throw new Error("Unauthorized");
    }
    return response;
  });
};

checkSession();