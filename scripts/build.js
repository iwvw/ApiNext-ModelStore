
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const MODULES_DIR = path.join(__dirname, '../modules');
const DIST_DIR = path.join(__dirname, '../dist');
const DIST_MODULES_DIR = path.join(DIST_DIR, 'modules');
const MARKET_FILE = path.join(DIST_DIR, 'market.json');

// Configuration
const REPO_OWNER = process.env.REPO_OWNER || 'iwvw'; // Default user
const REPO_NAME = process.env.REPO_NAME || 'ApiNext-ModelStore';
const BASE_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/gh-pages/modules`;

// Ensure dist exists
if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_MODULES_DIR, { recursive: true });

// Copy Template
const TEMPLATE_FILE = path.join(__dirname, '../templates/index.html');
const DIST_INDEX = path.join(DIST_DIR, 'index.html');
if (fs.existsSync(TEMPLATE_FILE)) {
    fs.copyFileSync(TEMPLATE_FILE, DIST_INDEX);
    console.log('Copied index.html template.');
}

const modules = [];

const items = fs.readdirSync(MODULES_DIR);

console.log(`Found ${items.length} items in modules directory.`);

for (const item of items) {
    const modulePath = path.join(MODULES_DIR, item);
    const stat = fs.statSync(modulePath);

    if (stat.isDirectory()) {
        console.log(`Processing module: ${item}`);

        // 1. Read package.json
        const pkgPath = path.join(modulePath, 'package.json');
        if (!fs.existsSync(pkgPath)) {
            console.warn(`Skipping ${item}: No package.json found`);
            continue;
        }

        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

        // 2. Create Zip
        const zip = new AdmZip();
        // Add package.json
        zip.addLocalFile(pkgPath);

        // Add server folder
        const serverDir = path.join(modulePath, 'server');
        if (fs.existsSync(serverDir)) {
            zip.addLocalFolder(serverDir, 'server');
        }

        // Add client folder (if built)
        const clientDir = path.join(modulePath, 'client');
        if (fs.existsSync(clientDir)) {
            zip.addLocalFolder(clientDir, 'client');
        }

        // Add locales if exists
        const localesDir = path.join(modulePath, 'locales');
        if (fs.existsSync(localesDir)) {
            zip.addLocalFolder(localesDir, 'locales');
        }

        const zipName = `${item}.zip`;
        const zipPath = path.join(DIST_MODULES_DIR, zipName);
        zip.writeZip(zipPath);
        console.log(`  > Created ${zipName}`);

        // 3. Add to index
        // Extract metadata from ai-dev standard or fallbacks
        const aidev = pkg.aidev || {};
        const ui = aidev.ui || {};

        modules.push({
            name: pkg.name,
            version: pkg.version,
            title: ui.sidebar?.label || { en: pkg.name },
            description: { en: pkg.description || "No description" },
            icon: ui.icon || aidev.icon || "Package",
            downloadUrl: `${BASE_URL}/${zipName}`,
            author: pkg.author || "Community",
            minAppVersion: "0.1.0" // Default assumption
        });
    }
}

// Write market.json
const marketIndex = {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    modules: modules
};

fs.writeFileSync(MARKET_FILE, JSON.stringify(marketIndex, null, 2));
console.log(`\nGenerated market.json with ${modules.length} modules.`);
