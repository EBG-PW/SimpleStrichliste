const fs = require('node:fs');
const path = require('node:path');
const express = require('ultimate-express');
const { getRuntimeFeatureApiModules } = require('@lib/features');
const router = new express.Router();

const plugins = [];
const Preplugins = [];
const runtimeApiModules = getRuntimeFeatureApiModules();

const getPluginRoute = (name) => name.endsWith('_api') ? name.slice(0, -4) : name;

// Helper: Remove elements from array
Array.prototype.remove = function () {
  let what, a = arguments, L = a.length, ax;
  while (L && this.length) {
    what = a[--L];
    while ((ax = this.indexOf(what)) !== -1) {
      this.splice(ax, 1);
    }
  }
  return this;
};


// Helper: Extract permission string from middleware
function extractRoutePermissionsFromCode(code) {
  const routeRegex = /router\.(get|post|put|delete|patch)\(\s*['"`](.+?)['"`]\s*,([\s\S]*?)=>/g;
  const matches = [];

  let match;
  while ((match = routeRegex.exec(code)) !== null) {
    const [, method, path, middlewareBlock] = match;

    const verifyMatch = /verifyRequest\(['"`](.+?)['"`]\)/.exec(middlewareBlock);
    const permission = verifyMatch ? verifyMatch[1] : null;

    matches.push({
      method: method.toUpperCase(),
      path,
      permission
    });
  }

  return matches;
}

// 1. Pre-scan all plugin versions
fs.readdirSync(__dirname).remove('index.js').forEach(file => {
  if (file.startsWith('disabled.') || !file.endsWith('.js')) return;
  const mod = require(`./${file.slice(0, -3)}`);
  Preplugins.push(`${mod.PluginName}|${mod.PluginVersion}`);
});

runtimeApiModules.forEach(({ filePath }) => {
  const mod = require(filePath);
  Preplugins.push(`${mod.PluginName}|${mod.PluginVersion}`);
});

// 2. Load plugins with dependencies resolved
fs.readdirSync(__dirname).remove('index.js').forEach(file => {
  if (!file.endsWith('.js')) return;

  const name = file.slice(0, -3);
  const fullPath = path.join(__dirname, file);

  if (file.startsWith('disabled.')) {
    process.log.warning(`Skipped API Plugin ${name} because it's disabled`);
    return;
  }

  try {
    const mod = require(`./${name}`);
    const code = fs.readFileSync(fullPath, 'utf8');
    const routes = extractRoutePermissionsFromCode(code);

    if (!mod.PluginName || !mod.PluginVersion || !mod.router) {
      process.log.error(`Skipped ${name} due to missing exports`);
      return;
    }

    let failedReq = false;
    mod.PluginRequirements?.forEach(req => {
      if (!Preplugins.includes(req)) failedReq = true;
    });

    if (failedReq) {
      process.log.error(`Plugin ${name} missing required: ${mod.PluginRequirements}`);
      return;
    }

    // Register plugin
    const route = `/${getPluginRoute(name)}`;
    router.use(route, mod.router);
    plugins.push({
      route,
      name: mod.PluginName,
      version: mod.PluginVersion,
      docs: mod.PluginDocs || '',
      author: mod.PluginAuthor || '',
      routes,
    });

    process.log.system(`Loaded API Plugin ${mod.PluginName}@${mod.PluginVersion}`);
  } catch (e) {
    process.log.error(`Failed to load plugin ${file}: ${e.message}`);
  }
});

runtimeApiModules.forEach(({ featureName, filePath, route }) => {
  try {
    const mod = require(filePath);
    const code = fs.readFileSync(filePath, 'utf8');
    const routes = extractRoutePermissionsFromCode(code);

    if (!mod.PluginName || !mod.PluginVersion || !mod.router) {
      process.log.error(`Skipped runtime API feature ${featureName} due to missing exports`);
      return;
    }

    let failedReq = false;
    mod.PluginRequirements?.forEach(req => {
      if (!Preplugins.includes(req)) failedReq = true;
    });

    if (failedReq) {
      process.log.error(`Runtime API feature ${featureName} missing required: ${mod.PluginRequirements}`);
      return;
    }

    router.use(route, mod.router);
    plugins.push({
      route,
      name: mod.PluginName,
      version: mod.PluginVersion,
      docs: mod.PluginDocs || '',
      author: mod.PluginAuthor || '',
      routes,
    });

    process.log.system(`Loaded runtime API feature ${mod.PluginName}@${mod.PluginVersion}`);
  } catch (e) {
    process.log.error(`Failed to load runtime API feature ${featureName}: ${e.message}`);
  }
});

// 3. API documentation route
router.get('/', (req, res) => {
  res.json({
    message: 'API - Loaded routes',
    plugins
  });
});

module.exports = router;
