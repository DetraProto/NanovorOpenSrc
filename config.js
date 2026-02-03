/**
 * Load and expose server config (version, connection settings, login screen).
 */

const fs = require('fs');
const path = require('path');

let versionInfo = {};
let connectionSettings = '';
let loginScreenConfig = '';

try {
    const versionIni = fs.readFileSync(path.join(__dirname, 'version.INI'), 'utf8');
    const versionRegex = /(\w+)=(\d+)/g;
    let match;
    while ((match = versionRegex.exec(versionIni)) !== null) {
        versionInfo[match[1]] = match[2];
    }
} catch (e) {
    console.warn('Could not load version.INI:', e.message);
}

try {
    connectionSettings = fs.readFileSync(path.join(__dirname, 'Config/connection_settings.xml'), 'utf8');
} catch (e) {
    console.warn('Could not load Config/connection_settings.xml:', e.message);
}

try {
    loginScreenConfig = fs.readFileSync(path.join(__dirname, 'Config/LoginScreenConfig.xml'), 'utf8');
} catch (e) {
    console.warn('Could not load Config/LoginScreenConfig.xml:', e.message);
}

module.exports = {
    versionInfo,
    connectionSettings,
    loginScreenConfig
};
