/**
 * General utility functions (IDs, tokens, dates).
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

function generateUniqueId() {
    return uuidv4().substring(0, 8);
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function generateAccountId(username) {
    return crypto.createHash('md5').update(username).digest('hex').substring(0, 8);
}

function formatDateForNanovor(date) {
    const year = date.getFullYear().toString().padStart(4, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0');

    const tzOffset = -date.getTimezoneOffset();
    const tzSign = tzOffset >= 0 ? '+' : '-';
    const tzHours = Math.floor(Math.abs(tzOffset) / 60).toString().padStart(2, '0');
    const tzMinutes = (Math.abs(tzOffset) % 60).toString().padStart(2, '0');
    const tzString = `${tzSign}${tzHours}:${tzMinutes}`;

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${tzString}`;
}

module.exports = {
    generateUniqueId,
    generateToken,
    generateAccountId,
    formatDateForNanovor
};
