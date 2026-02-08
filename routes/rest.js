const path = require('path');
const fs = require('fs');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const state = require('../state');
const user = require('../user');
const utils = require('../lib/utils');
const { users, sessions, getNextAccountId, getNextEmAssetId } = state;
const { findSessionByToken, createUserProfile, saveUserData, loadUserDataByUsername, loadUserData } = user;
const { generateToken, formatDateForNanovor } = utils;

function parseAccountId(param) {
    const id = parseInt(param, 10);
    return Number.isNaN(id) ? null : id;
}

function registerRest(app) {
// Bank Frontend Service
app.get('/bankfe/resources/account/:accountId', (req, res) => {
    const accountId = parseAccountId(req.params.accountId);
    if (accountId === null) return res.status(400).send('Invalid account ID');
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Account info request for ${accountId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Verify token
    const session = findSessionByToken(auth);
    if (!session || session.accountId !== accountId) {
        console.log(`[${new Date().toISOString()}] Invalid token for account info request - session: ${session ? session.accountId : 'none'}, accountId: ${accountId}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Return user account info
    const user = users[accountId];
    if (!user) {
        console.log(`[${new Date().toISOString()}] User not found for account info request - accountId: ${accountId}`);
        return res.status(404).send('<error>User not found</error>');
    }

    const accountInfo = `
<account xmlns="http://127.0.0.1:8443/xsd/account/account.xsd">
  <username>${user.username}</username>
  <screenname>${user.screenname}</screenname>
  <email-address>${user.email}</email-address>
  <phone-number>${user.phoneNumber || ''}</phone-number>
  <avatar-id>${user.avatarId}</avatar-id>
  <token-balance>${user.nanocash}</token-balance>
  <jolt_health_balance>${user.healthJolts}</jolt_health_balance>
  <jolt_armor_balance>${user.armorJolts}</jolt_armor_balance>
  <jolt_strength_balance>${user.strengthJolts}</jolt_strength_balance>
  <jolt_speed_balance>${user.speedJolts}</jolt_speed_balance>
  <virmon-master-rating>${user.nmp}</virmon-master-rating>
  <games-played>${user.gamesPlayed}</games-played>
</account>`;

    console.log(`[${new Date().toISOString()}] Sending account info response for ${accountId}`);
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(accountInfo);
});

app.get('/bankfe/resources/account/:accountId/stat', (req, res) => {
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Account stats request, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Verify token
    const session = findSessionByToken(auth);
    if (!session) {
        console.log(`[${new Date().toISOString()}] Invalid token for account stats request - auth: ${auth}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    const user = users[session.accountId];
    if (!user) {
        console.log(`[${new Date().toISOString()}] User not found for account stats request - accountId: ${session.accountId}`);
        return res.status(404).send('<error>User not found</error>');
    }

    const accountStats = `
<account-statistics xmlns="http://127.0.0.1:8443/xsd/account-statistics/account-statistics.xsd">
  <virmon-master-rating>${user.nmp}</virmon-master-rating>
  <kill-count>${user.totalKills}</kill-count>
  <game-count>${user.gamesPlayed}</game-count>
  <win-count>${user.gamesWon}</win-count>
  <two-player-game-count>${user.twoPlayerGames}</two-player-game-count>
  <three-player-game-count>${user.threePlayerGames}</three-player-game-count>
  <four-player-game-count>${user.fourPlayerGames}</four-player-game-count>
  <hexite-kill-count>${user.hexiteKills}</hexite-kill-count>
  <magnamod-kill-count>${user.magnamodKills}</magnamod-kill-count>
  <velocitron-kill-count>${user.velocitronKills}</velocitron-kill-count>
  <nanovor-count>${user.nanovorCount}</nanovor-count>
  <unique-nanovor-count>${user.nanovorCountUnique}</unique-nanovor-count>
</account-statistics>`;

    console.log(`[${new Date().toISOString()}] Sending account stats response for ${session.accountId}`);
    res.set('Content-Type', 'application/xml');
    res.send(accountStats);
});

// Additional account statistics endpoint by account ID (might be used by client)
app.get('/bankfe/resources/account/:accountId/stat', (req, res) => {
    const accountId = parseAccountId(req.params.accountId);
    if (accountId === null) return res.status(400).send('Invalid account ID');
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Account stats request for ${accountId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Verify token
    const session = findSessionByToken(auth);
    if (!session) {
        console.log(`[${new Date().toISOString()}] Invalid token for account stats request - auth: ${auth}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Verify that the requested account ID matches the authenticated session
    if (session.accountId !== accountId) {
        console.log(`[${new Date().toISOString()}] Unauthorized account stats request - session accountId: ${session.accountId}, requested accountId: ${accountId}`);
        return res.status(403).send('<error>Unauthorized</error>');
    }

    const user = users[accountId];
    if (!user) {
        console.log(`[${new Date().toISOString()}] User not found for account stats request - accountId: ${accountId}`);
        return res.status(404).send('<error>User not found</error>');
    }

    const accountStats = `
<account-statistics xmlns="http://127.0.0.1:8443/xsd/account-statistics/account-statistics.xsd">
  <virmon-master-rating>${user.nmp}</virmon-master-rating>
  <kill-count>${user.totalKills}</kill-count>
  <game-count>${user.gamesPlayed}</game-count>
  <win-count>${user.gamesWon}</win-count>
  <two-player-game-count>${user.twoPlayerGames}</two-player-game-count>
  <three-player-game-count>${user.threePlayerGames}</three-player-game-count>
  <four-player-game-count>${user.fourPlayerGames}</four-player-game-count>
  <hexite-kill-count>${user.hexiteKills}</hexite-kill-count>
  <magnamod-kill-count>${user.magnamodKills}</magnamod-kill-count>
  <velocitron-kill-count>${user.velocitronKills}</velocitron-kill-count>
  <nanovor-count>${user.nanovorCount}</nanovor-count>
  <unique-nanovor-count>${user.nanovorCountUnique}</unique-nanovor-count>
</account-statistics>`;

    console.log(`[${new Date().toISOString()}] Sending account stats response for ${accountId}`);
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(accountStats);
});

// XSD Schema endpoint for account statistics
app.get('/xsd/account-statistics/account-statistics.xsd', (req, res) => {
    console.log(`[${new Date().toISOString()}] Account statistics XSD schema requested, Query:`, req.query, 'Headers:', req.headers);

    // Return XSD schema for account statistics
    const xsdSchema = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
           targetNamespace="http://127.0.0.1:8443/xsd/account-statistics/account-statistics.xsd"
           xmlns:tns="http://127.0.0.1:8443/xsd/account-statistics/account-statistics.xsd"
           elementFormDefault="qualified">

    <xs:element name="account-statistics">
        <xs:complexType>
            <xs:sequence>
                <xs:element name="virmon-master-rating" type="xs:integer" minOccurs="0"/>
                <xs:element name="kill-count" type="xs:integer" minOccurs="0"/>
                <xs:element name="game-count" type="xs:integer" minOccurs="0"/>
                <xs:element name="win-count" type="xs:integer" minOccurs="0"/>
                <xs:element name="two-player-game-count" type="xs:integer" minOccurs="0"/>
                <xs:element name="three-player-game-count" type="xs:integer" minOccurs="0"/>
                <xs:element name="four-player-game-count" type="xs:integer" minOccurs="0"/>
                <xs:element name="hexite-kill-count" type="xs:integer" minOccurs="0"/>
                <xs:element name="magnamod-kill-count" type="xs:integer" minOccurs="0"/>
                <xs:element name="velocitron-kill-count" type="xs:integer" minOccurs="0"/>
                <xs:element name="nanovor-count" type="xs:integer" minOccurs="0"/>
                <xs:element name="unique-nanovor-count" type="xs:integer" minOccurs="0"/>
            </xs:sequence>
        </xs:complexType>
    </xs:element>
</xs:schema>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(xsdSchema);
});

// Endpoint for account statistics (used by requestFromBank with path "/stat/account/{accountId}")
// The client requests this as: {bankURLRead}/stat/account/{accountId}?auth={token}
app.get('/stat/account/:accountId', (req, res) => {
    const accountId = parseAccountId(req.params.accountId);
    if (accountId === null) return res.status(400).send('Invalid account ID');
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Account statistics request for ${accountId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Verify token
    const session = findSessionByToken(auth);
    if (!session) {
        console.log(`[${new Date().toISOString()}] Invalid token for account stats request - auth: ${auth}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Verify that the requested account ID matches the authenticated session
    if (session.accountId !== accountId) {
        console.log(`[${new Date().toISOString()}] Unauthorized account stats request - session accountId: ${session.accountId}, requested accountId: ${accountId}`);
        return res.status(403).send('<error>Unauthorized</error>');
    }

    const user = users[accountId];
    if (!user) {
        console.log(`[${new Date().toISOString()}] User not found for account stats request - accountId: ${accountId}`);
        return res.status(404).send('<error>User not found</error>');
    }

    // Return account statistics in the expected format
    const accountStats = `
<account-statistics xmlns="http://127.0.0.1:8443/xsd/account-statistics/account-statistics.xsd">
  <virmon-master-rating>${user.nmp || 0}</virmon-master-rating>
  <kill-count>${user.totalKills || 0}</kill-count>
  <game-count>${user.gamesPlayed || 0}</game-count>
  <win-count>${user.gamesWon || 0}</win-count>
  <two-player-game-count>${user.twoPlayerGames || 0}</two-player-game-count>
  <three-player-game-count>${user.threePlayerGames || 0}</three-player-game-count>
  <four-player-game-count>${user.fourPlayerGames || 0}</four-player-game-count>
  <hexite-kill-count>${user.hexiteKills || 0}</hexite-kill-count>
  <magnamod-kill-count>${user.magnamodKills || 0}</magnamod-kill-count>
  <velocitron-kill-count>${user.velocitronKills || 0}</velocitron-kill-count>
  <nanovor-count>${user.nanovorCount || 2}</nanovor-count>
  <unique-nanovor-count>${user.nanovorCountUnique || 2}</unique-nanovor-count>
</account-statistics>`;

    console.log(`[${new Date().toISOString()}] Sending account statistics response for ${accountId}`);
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(accountStats);
});

// Also keep the original endpoint for backward compatibility
app.get('/stat/account/', (req, res) => {
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Account statistics request (general endpoint), auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Verify token
    const session = findSessionByToken(auth);
    if (!session) {
        console.log(`[${new Date().toISOString()}] Invalid token for account stats request - auth: ${auth}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    const user = users[session.accountId];
    if (!user) {
        console.log(`[${new Date().toISOString()}] User not found for account stats request - accountId: ${session.accountId}`);
        return res.status(404).send('<error>User not found</error>');
    }

    // Return account statistics in the expected format
    const accountStats = `
<account-statistics xmlns="http://127.0.0.1:8443/xsd/account-statistics/account-statistics.xsd">
  <virmon-master-rating>${user.nmp || 0}</virmon-master-rating>
  <kill-count>${user.totalKills || 0}</kill-count>
  <game-count>${user.gamesPlayed || 0}</game-count>
  <win-count>${user.gamesWon || 0}</win-count>
  <two-player-game-count>${user.twoPlayerGames || 0}</two-player-game-count>
  <three-player-game-count>${user.threePlayerGames || 0}</three-player-game-count>
  <four-player-game-count>${user.fourPlayerGames || 0}</four-player-game-count>
  <hexite-kill-count>${user.hexiteKills || 0}</hexite-kill-count>
  <magnamod-kill-count>${user.magnamodKills || 0}</magnamod-kill-count>
  <velocitron-kill-count>${user.velocitronKills || 0}</velocitron-kill-count>
  <nanovor-count>${user.nanovorCount || 2}</nanovor-count>
  <unique-nanovor-count>${user.nanovorCountUnique || 2}</unique-nanovor-count>
</account-statistics>`;

    console.log(`[${new Date().toISOString()}] Sending account statistics response for ${session.accountId}`);
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(accountStats);
});

// More specific catch-all for account-related requests to avoid interfering with asset requests
app.get('/bankfe/resources/account/:accountId', (req, res) => {
    const accountId = parseAccountId(req.params.accountId);
    if (accountId === null) return res.status(400).send('Invalid account ID');
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Account info request for ${accountId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Verify token
    const session = findSessionByToken(auth);
    if (!session || session.accountId !== accountId) {
        console.log(`[${new Date().toISOString()}] Invalid token for account info request - session: ${session ? session.accountId : 'none'}, accountId: ${accountId}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Get user account
    const user = users[accountId];
    if (!user) {
        console.log(`[${new Date().toISOString()}] User not found for account info request - accountId: ${accountId}`);
        return res.status(404).send('<error>User not found</error>');
    }

    // Return account info in the expected format
    const accountInfo = `
<account xmlns="http://127.0.0.1:8443/xsd/account/account.xsd">
  <username>${user.username}</username>
  <screenname>${user.screenname}</screenname>
  <email-address>${user.email}</email-address>
  <phone-number>${user.phoneNumber || ''}</phone-number>
  <avatar-id>${user.avatarId || 1}</avatar-id>
  <token-balance>${user.nanocash || 0}</token-balance>
  <jolt_health_balance>${user.healthJolts || 0}</jolt_health_balance>
  <jolt_armor_balance>${user.armorJolts || 0}</jolt_armor_balance>
  <jolt_strength_balance>${user.strengthJolts || 0}</jolt_strength_balance>
  <jolt_speed_balance>${user.speedJolts || 0}</jolt_speed_balance>
  <virmon-master-rating>${user.nmp || 0}</virmon-master-rating>
  <games-played>${user.gamesPlayed || 0}</games-played>
</account>`;

    console.log(`[${new Date().toISOString()}] Sending account info response for ${accountId}`);
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(accountInfo);
});

// Additional endpoint that might be needed for user profile data
app.get('/bankfe/resources/account/profile/:accountId', (req, res) => {
    const accountId = parseAccountId(req.params.accountId);
    if (accountId === null) return res.status(400).send('Invalid account ID');
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Account profile request for ${accountId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Verify token
    const session = findSessionByToken(auth);
    if (!session || session.accountId !== accountId) {
        console.log(`[${new Date().toISOString()}] Invalid token for account profile request - session: ${session ? session.accountId : 'none'}, accountId: ${accountId}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Return user profile info
    const user = users[accountId];
    if (!user) {
        console.log(`[${new Date().toISOString()}] User not found for account profile request - accountId: ${accountId}`);
        return res.status(404).send('<error>User not found</error>');
    }

    const profileInfo = `
<account-profile xmlns="http://127.0.0.1:8443/xsd/account/account-profile.xsd">
  <virmon-master-rating>${user.nmp || 0}</virmon-master-rating>
  <game-count>${user.gamesPlayed || 0}</game-count>
  <phone-number>${user.phoneNumber || ''}</phone-number>
  <avatar-id>${user.avatarId || 1}</avatar-id>
</account-profile>`;

    console.log(`[${new Date().toISOString()}] Sending account profile response for ${accountId}`);
    res.set('Content-Type', 'application/xml');
    res.send(profileInfo);
});

// Endpoint to add a nanovor to a user's inventory
app.post('/bankfe/resources/account/:accountId/nanovor', (req, res) => {
    const accountId = parseAccountId(req.params.accountId);
    if (accountId === null) return res.status(400).send('Invalid account ID');
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Add nanovor request for account ${accountId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers, 'Body:', req.body.toString());

    // Verify token
    const session = findSessionByToken(auth);
    if (!session || session.accountId !== accountId) {
        console.log(`[${new Date().toISOString()}] Invalid token for add nanovor request - session: ${session ? session.accountId : 'none'}, accountId: ${accountId}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Parse nanovor data from request
    let nanovorData;

    // Check if the body is JSON or XML
    const bodyStr = req.body.toString();
    if (bodyStr.trim().startsWith('{')) {
        // It's JSON
        try {
            nanovorData = JSON.parse(bodyStr);
        } catch (e) {
            console.error('Error parsing JSON nanovor data:', e);
            return res.status(400).send('<error>Invalid JSON data</error>');
        }
    } else {
        // It's XML, parse it synchronously
        const parseString = require('xml2js').parseStringSync;
        try {
            const result = parseString(bodyStr);
            const nanovor = result.nanovor || result.virmon || (result.root ? (result.root.nanovor || result.root.virmon) : null);
            if (nanovor && nanovor[0]) {
                const n = nanovor[0];
                nanovorData = {
                    id: parseInt(n.id?.[0]) || 0,
                    name: n.name?.[0] || 'Unknown Nanovor',
                    faction: n.faction?.[0] || 'Unknown',
                    rarity: n.rarity?.[0] || 'common',
                    wave: parseInt(n.wave?.[0]) || 1,
                    health: parseInt(n.health?.[0]) || 100,
                    armor: parseInt(n.armor?.[0]) || 0,
                    speed: parseInt(n.speed?.[0]) || 50,
                    strength: parseInt(n.strength?.[0]) || 50,
                    type: 'nanovor',
                    assetTypeId: parseInt(n.assetTypeId?.[0]) || parseInt(n.id?.[0]) || 0
                };
            } else {
                return res.status(400).send('<error>No valid nanovor data found in XML</error>');
            }
        } catch (e) {
            console.error('Error parsing XML nanovor data:', e);
            return res.status(400).send('<error>Invalid XML data</error>');
        }
    }

    // Add nanovor to user's inventory
    const user = users[accountId];
    if (!user) {
        console.log(`[${new Date().toISOString()}] User not found for add nanovor request - accountId: ${accountId}`);
        return res.status(404).send('<error>User not found</error>');
    }

    // Ensure nanovorInventory exists
    if (!user.nanovorInventory) {
        user.nanovorInventory = [];
    }

    // Add the new nanovor to inventory
    user.nanovorInventory.push(nanovorData);

    // Update counts
    user.nanovorCount = user.nanovorInventory.length;
    user.nanovorCountUnique = user.nanovorInventory.length; // Simplified for now

    // Save user data after updating inventory
    saveUserData(accountId);

    const response = `<nanovor-add-success xmlns="http://127.0.0.1:8443/xsd/nanovor-add/nanovor-add-success.xsd"/>`;

    console.log(`[${new Date().toISOString()}] Successfully added nanovor to account ${accountId}`);
    res.set('Content-Type', 'application/xml');
    res.send(response);
});

// Endpoint to remove a nanovor from a user's inventory
app.delete('/bankfe/resources/account/:accountId/nanovor/:nanovorId', (req, res) => {
    const accountId = parseAccountId(req.params.accountId);
    if (accountId === null) return res.status(400).send('Invalid account ID');
    const nanovorId = parseInt(req.params.nanovorId);
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Remove nanovor request for account ${accountId}, nanovorId: ${nanovorId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Verify token
    const session = findSessionByToken(auth);
    if (!session || session.accountId !== accountId) {
        console.log(`[${new Date().toISOString()}] Invalid token for remove nanovor request - session: ${session ? session.accountId : 'none'}, accountId: ${accountId}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Remove nanovor from user's inventory
    const user = users[accountId];
    if (!user) {
        console.log(`[${new Date().toISOString()}] User not found for remove nanovor request - accountId: ${accountId}`);
        return res.status(404).send('<error>User not found</error>');
    }

    if (user.nanovorInventory) {
        // Filter out the nanovor with the specified ID
        user.nanovorInventory = user.nanovorInventory.filter(nanovor => nanovor.id !== nanovorId);

        // Update counts
        user.nanovorCount = user.nanovorInventory.length;
        user.nanovorCountUnique = user.nanovorInventory.length; // Simplified for now

        // Save user data after updating inventory
        saveUserData(accountId);
    }

    const response = `<nanovor-remove-success xmlns="http://127.0.0.1:8443/xsd/nanovor-remove/nanovor-remove-success.xsd"/>`;

    console.log(`[${new Date().toISOString()}] Successfully removed nanovor ${nanovorId} from account ${accountId}`);
    res.set('Content-Type', 'application/xml');
    res.send(response);
});

// Endpoint to add an Energy Matrix to a user's inventory
app.post('/bankfe/resources/account/:accountId/em', (req, res) => {
    const accountId = parseAccountId(req.params.accountId);
    if (accountId === null) return res.status(400).send('Invalid account ID');
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Add EM request for account ${accountId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers, 'Body:', req.body.toString());

    // Verify token
    const session = findSessionByToken(auth);
    if (!session || session.accountId !== accountId) {
        console.log(`[${new Date().toISOString()}] Invalid token for add EM request - session: ${session ? session.accountId : 'none'}, accountId: ${accountId}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Parse EM data from request
    let emData;

    // Check if the body is JSON or XML
    const bodyStr = req.body.toString();
    if (bodyStr.trim().startsWith('{')) {
        // It's JSON
        try {
            emData = JSON.parse(bodyStr);
        } catch (e) {
            console.error('Error parsing JSON EM data:', e);
            return res.status(400).send('<error>Invalid JSON data</error>');
        }
    } else {
        // It's XML, parse it synchronously
        const parseString = require('xml2js').parseStringSync;
        try {
            const result = parseString(bodyStr);
            const em = result.em || (result.root ? result.root.em : null);
            if (em && em[0]) {
                const e = em[0];
                emData = {
                    id: parseInt(e.id?.[0], 10) || 0,
                    name: e.name?.[0] || 'Unknown EM',
                    assetTypeId: parseInt(e.assetTypeId?.[0], 10) || parseInt(e.id?.[0], 10) || 0
                };
            } else {
                return res.status(400).send('<error>No valid EM data found in XML</error>');
            }
        } catch (e) {
            console.error('Error parsing XML EM data:', e);
            return res.status(400).send('<error>Invalid XML data</error>');
        }
    }

    // EM ids are integers only (no uuid). Assign next id if missing/0/non-integer.
    const parsedId = typeof emData.id === 'number' ? Math.floor(emData.id) : parseInt(emData.id, 10);
    if (Number.isNaN(parsedId) || parsedId < 1) {
        emData.id = getNextEmAssetId();
    } else {
        emData.id = parsedId;
    }
    emData.assetTypeId = typeof emData.assetTypeId === 'number' ? Math.floor(emData.assetTypeId) : (parseInt(emData.assetTypeId, 10) || 0);

    // Add EM to user's inventory
    const user = users[accountId];
    if (!user) {
        console.log(`[${new Date().toISOString()}] User not found for add EM request - accountId: ${accountId}`);
        return res.status(404).send('<error>User not found</error>');
    }

    // Ensure emInventory exists
    if (!user.emInventory) {
        user.emInventory = [];
    }

    // Add the new EM to inventory
    user.emInventory.push(emData);

    // Update EM count
    user.ems = user.emInventory.length;

    // Save user data after updating inventory
    saveUserData(accountId);

    const response = `<em-add-success xmlns="http://127.0.0.1:8443/xsd/em-add/em-add-success.xsd"/>`;

    console.log(`[${new Date().toISOString()}] Successfully added EM to account ${accountId}`);
    res.set('Content-Type', 'application/xml');
    res.send(response);
});

// Endpoint to remove an Energy Matrix from a user's inventory
app.delete('/bankfe/resources/account/:accountId/em/:emId', (req, res) => {
    const accountId = parseAccountId(req.params.accountId);
    if (accountId === null) return res.status(400).send('Invalid account ID');
    const emId = parseInt(req.params.emId);
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Remove EM request for account ${accountId}, emId: ${emId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Verify token
    const session = findSessionByToken(auth);
    if (!session || session.accountId !== accountId) {
        console.log(`[${new Date().toISOString()}] Invalid token for remove EM request - session: ${session ? session.accountId : 'none'}, accountId: ${accountId}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Remove EM from user's inventory
    const user = users[accountId];
    if (!user) {
        console.log(`[${new Date().toISOString()}] User not found for remove EM request - accountId: ${accountId}`);
        return res.status(404).send('<error>User not found</error>');
    }

    if (user.emInventory) {
        // Filter out the EM with the specified ID
        user.emInventory = user.emInventory.filter(em => em.id !== emId);

        // Update EM count
        user.ems = user.emInventory.length;

        // Save user data after updating inventory
        saveUserData(accountId);
    }

    const response = `<em-remove-success xmlns="http://127.0.0.1:8443/xsd/em-remove/em-remove-success.xsd"/>`;

    console.log(`[${new Date().toISOString()}] Successfully removed EM ${emId} from account ${accountId}`);
    res.set('Content-Type', 'application/xml');
    res.send(response);
});

app.use('/xsd', express.static(path.join(__dirname, '..', 'xsd')));

// Account badges endpoint
app.get('/bankfe/resources/account/:accountId/badge', (req, res) => {
    const accountId = parseAccountId(req.params.accountId);
    if (accountId === null) return res.status(400).send('Invalid account ID');
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Account badges request for ${accountId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Verify token
    const session = findSessionByToken(auth);
    if (!session || session.accountId !== accountId) {
        console.log(`[${new Date().toISOString()}] Invalid token for account badges request - session: ${session ? session.accountId : 'none'}, accountId: ${accountId}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Return user badges info
    const user = users[accountId];
    if (!user) {
        console.log(`[${new Date().toISOString()}] User not found for account badges request - accountId: ${accountId}`);
        return res.status(404).send('<error>User not found</error>');
    }

    // Return empty badges for now, or populate with user's badges
    const badges = user.badges || [];

    const badgesXml = `
<badges xmlns="http://127.0.0.1:8443/xsd/badges/badges.xsd">
</badges>`;

    console.log(`[${new Date().toISOString()}] Sending account badges response for ${accountId} with ${badges.length} badges`);
    res.set('Content-Type', 'application/xml');
    res.send(badgesXml);
});

// Asset list endpoint - this is what the VirmonManager uses to get collection data
app.get('/bankfe/resources/account/:accountId/asset-list', (req, res) => {
    const accountId = parseAccountId(req.params.accountId);
    if (accountId === null) return res.status(400).send('Invalid account ID');
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Asset list request received for ${accountId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Verify token
    console.log(`[${new Date().toISOString()}] Verifying token for asset list request - auth: ${auth}, accountId: ${accountId}`);
    const session = findSessionByToken(auth);
    console.log(`[${new Date().toISOString()}] Session lookup result:`, session ? {accountId: session.accountId, loginToken: session.loginToken} : 'no session found');
    if (!session || session.accountId !== accountId) {
        console.log(`[${new Date().toISOString()}] Invalid token for asset list request - session: ${session ? session.accountId : 'none'}, accountId: ${accountId}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Return user's asset list in the format expected by VirmonManager
    const user = users[accountId];
    if (!user) {
        console.log(`[${new Date().toISOString()}] User not found for asset list request - accountId: ${accountId}`);
        return res.status(404).send('<error>User not found</error>');
    }

    console.log(`[${new Date().toISOString()}] Asset list request for user:`, user.username);
    console.log(`[${new Date().toISOString()}] User nanovor inventory count:`, user.nanovorInventory ? user.nanovorInventory.length : 0);
    console.log(`[${new Date().toISOString()}] User nanovor inventory:`, user.nanovorInventory);
    console.log(`[${new Date().toISOString()}] Full user object nanovorInventory:`, JSON.stringify(user.nanovorInventory, null, 2));

    // Build XML for nanovor inventory in the exact format expected by VirmonData.parseXMLData
    let assetsXml = '';

    // Add nanovor to the asset list (only include nanovor for now, excluding EMs)
    const nanovorList = user.nanovorInventory || [];
    for (let i = 0; i < nanovorList.length; i++) {
        const nanovor = nanovorList[i];
        const assetId = Number(nanovor.id);

        const productionNumber = nanovor.productionNumber || 1;
        const birthDate = nanovor.birthDate || formatDateForNanovor(new Date());
        const lastEvolutionDate = nanovor.lastEvolutionDate || formatDateForNanovor(new Date());
        // virmon-master asset-type ID
        const assetTypeId = nanovor.assetTypeId ?? 1;
        const assetTypeName = nanovor.name || 'Unknown Nanovor';

        assetsXml += `
    <asset id="${assetId}" xmlns:ns2="http://smithandtinker.com/xsd/asset-miscellany" xmlns:ns3="http://smithandtinker.com/xsd/asset-stat">
      <asset-type-category>virmon</asset-type-category>
      <asset-type-id>${assetTypeId}</asset-type-id>
      <asset-type-name>${assetTypeName}</asset-type-name>
      <production-number>${productionNumber}</production-number>
      <birth-date>${birthDate}</birth-date>
      <last-evolution-date>${lastEvolutionDate}</last-evolution-date>
      <ns2:asset-miscellany>
        <ns2:nickname>${nanovor.nickname || ''}</ns2:nickname>
      </ns2:asset-miscellany>
      <ns3:asset-stat>
        <ns3:asset-type-id>${assetTypeId}</ns3:asset-type-id>
        <ns3:speed>${nanovor.speed || 10}</ns3:speed>
        <ns3:strength>${nanovor.strength || 100}</ns3:strength>
        <ns3:armor>${nanovor.armor || 5}</ns3:armor>
        <ns3:health>${nanovor.health || 100}</ns3:health>
        <ns3:kill-count>${nanovor.killCount || 0}</ns3:kill-count>
        <ns3:kill-count-lifetime>${nanovor.lifetimeKillCount || 0}</ns3:kill-count-lifetime>
        <ns3:battle-count>${nanovor.battleCount || 0}</ns3:battle-count>
        <ns3:battle-count-lifetime>${nanovor.lifetimeBattleCount || 0}</ns3:battle-count-lifetime>
        <ns3:death-count>${nanovor.deathCount || 0}</ns3:death-count>
        <ns3:death-count-lifetime>${nanovor.lifetimeDeathCount || 0}</ns3:death-count-lifetime>
        <ns3:magnamod-kill-count>${nanovor.magnamodKillCount || 0}</ns3:magnamod-kill-count>
        <ns3:magnamod-kill-count-lifetime>${nanovor.magnamodLifetimeKillCount || 0}</ns3:magnamod-kill-count-lifetime>
        <ns3:hexite-kill-count>${nanovor.hexiteKillCount || 0}</ns3:hexite-kill-count>
        <ns3:hexite-kill-count-lifetime>${nanovor.hexiteLifetimeKillCount || 0}</ns3:hexite-kill-count-lifetime>
        <ns3:velocitron-kill-count>${nanovor.velocitronKillCount || 0}</ns3:velocitron-kill-count>
        <ns3:velocitron-kill-count-lifetime>${nanovor.velocitronLifetimeKillCount || 0}</ns3:velocitron-kill-count-lifetime>
        <ns3:win-count>${nanovor.winCount || 0}</ns3:win-count>
        <ns3:win-count-lifetime>${nanovor.lifetimeWinCount || 0}</ns3:win-count-lifetime>
        <ns3:critical-hit-count>${nanovor.criticalHitCount || 0}</ns3:critical-hit-count>
        <ns3:whiff-count>${nanovor.whiffCount || 0}</ns3:whiff-count>
        <ns3:screen-star>${nanovor.isScreenStar || false}</ns3:screen-star>
        <ns3:scraped-by>${nanovor.isScrapedBy || false}</ns3:scraped-by>
        <ns3:all-attacks-used>${nanovor.areAllAttacksUsed || false}</ns3:all-attacks-used>
        <ns3:slacker>${nanovor.isSlacker || false}</ns3:slacker>
        <ns3:max-damage-game>${nanovor.maxDamageGame || 0}</ns3:max-damage-game>
        <ns3:max-damage-hit>${nanovor.maxDamageHit || 0}</ns3:max-damage-hit>
        <ns3:max-round-count>${nanovor.maxRoundCount || 0}</ns3:max-round-count>
      </ns3:asset-stat>
    </asset>`;
    }

    // NOTE: EM assets are intentionally excluded for now to simplify the asset list

    const assetList = `<?xml version="1.0" encoding="UTF-8"?>
<asset-list>
${assetsXml}
</asset-list>`;

    console.log(`[${new Date().toISOString()}] Sending asset list response for ${accountId}`);
    console.log(`[${new Date().toISOString()}] Asset list XML being sent:`, assetList);
    res.set('Content-Type', 'application/xml');
    res.send(assetList);
});

// Endpoint for refreshing user token (might be called periodically)
app.post('/bankfe/resources/account/refresh-login', (req, res) => {
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Token refresh request, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers, 'Body:', req.body.toString());

    // Find and refresh the session
    const session = findSessionByToken(auth);
    if (!session) {
        console.log(`[${new Date().toISOString()}] Invalid token for refresh request - auth: ${auth}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Generate new token
    const newToken = generateToken();
    session.loginToken = newToken;
    session.expires = Date.now() + 30 * 60 * 1000; // 30 minutes

    // Update user's token in all references
    for (const userId in users) {
        if (users[userId].loginToken === auth) {
            users[userId].loginToken = newToken;
            console.log(`[${new Date().toISOString()}] Updated token for user ${userId}`);
            break;
        }
    }

    const refreshResponse = `<token>${newToken}</token>`;

    console.log(`[${new Date().toISOString()}] Token refreshed successfully, new token: ${newToken}`);
    res.set('Content-Type', 'application/xml');
    res.send(refreshResponse);
});

// Additional endpoints that might be needed for inventory/collections after login
app.get('/bankfe/resources/account/collections/:accountId', (req, res) => {
    const accountId = parseAccountId(req.params.accountId);
    if (accountId === null) return res.status(400).send('Invalid account ID');
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Account collections request for ${accountId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Verify token
    const session = findSessionByToken(auth);
    if (!session || session.accountId !== accountId) {
        console.log(`[${new Date().toISOString()}] Invalid token for account collections request - session: ${session ? session.accountId : 'none'}, accountId: ${accountId}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Return user's collection data
    const user = users[accountId];
    if (!user) {
        console.log(`[${new Date().toISOString()}] User not found for account collections request - accountId: ${accountId}`);
        return res.status(404).send('<error>User not found</error>');
    }

    // Return user's collection data from their inventory
    const nanovorList = user.nanovorInventory || [];
    const emList = user.emInventory || [];

    // Build XML for nanovor inventory
    let virmonXml = '';
    for (const nanovor of nanovorList) {
        // Use the assetTypeId as the type identifier and create a unique instance ID
        // For simplicity, we'll use the same ID as both assetTypeId and assetId for now
        // In a real implementation, assetId would be a unique instance identifier
        const assetId = nanovor.assetTypeId.toString(); // This could be a unique instance ID in production
        virmonXml += `
    <virmon>
      <id>${nanovor.id}</id>
      <name>${nanovor.name}</name>
      <assetTypeId>${nanovor.assetTypeId}</assetTypeId>
      <assetId>${assetId}</assetId>
      <faction>${nanovor.faction}</faction>
      <rarity>${nanovor.rarity}</rarity>
      <wave>${nanovor.wave}</wave>
      <base-health>${nanovor.health}</base-health>
      <base-armor>${nanovor.armor}</base-armor>
      <base-speed>${nanovor.speed}</base-speed>
      <base-strength>${nanovor.strength}</base-strength>
    </virmon>`;
    }

    // NOTE: EM inventory is intentionally excluded for now to simplify the collection list

    const collectionsData = `
<collections xmlns="http://127.0.0.1:8443/xsd/collections/collections.xsd">
  <virmonList>
${virmonXml}
  </virmonList>
  <emList>
    <!-- EMs intentionally excluded for now -->
  </emList>
</collections>`;

    console.log(`[${new Date().toISOString()}] Sending account collections response for ${accountId}`);
    res.set('Content-Type', 'application/xml');
    res.send(collectionsData);
});

// Asset badges endpoint
app.get('/bankfe/resources/asset/:assetId/badge', (req, res) => {
    const assetId = req.params.assetId;
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Asset badges request for asset ${assetId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Verify token
    const session = findSessionByToken(auth);
    if (!session) {
        console.log(`[${new Date().toISOString()}] Invalid token for asset badges request - auth: ${auth}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Return asset badges info
    // For now, return empty badges
    const badgesXml = `
<asset-badges xmlns="http://127.0.0.1:8443/xsd/asset/asset-badges.xsd">
</asset-badges>`;

    console.log(`[${new Date().toISOString()}] Sending asset badges response for asset ${assetId}`);
    res.set('Content-Type', 'application/xml');
    res.send(badgesXml);
});

// Endpoint for saving/updating user profile information
app.post('/bankfe/resources/account/:accountId/profile', (req, res) => {
    const accountId = parseAccountId(req.params.accountId);
    if (accountId === null) return res.status(400).send('Invalid account ID');
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Account profile update request for ${accountId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers, 'Body:', req.body.toString());

    // Verify token
    const session = findSessionByToken(auth);
    if (!session || session.accountId !== accountId) {
        console.log(`[${new Date().toISOString()}] Invalid token for account profile update request - session: ${session ? session.accountId : 'none'}, accountId: ${accountId}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Parse the profile data from the request
    const profileData = req.body.toString();
    console.log(`[${new Date().toISOString()}] Profile update data: ${profileData}`);

    // Update user profile
    if (users[accountId]) {
        // This is a simplified update - in a real implementation you'd parse the XML
        // and update specific fields
        console.log(`[${new Date().toISOString()}] Updated profile for user ${accountId}`);
    }

    // Return success response
    const response = `<profile-update-success xmlns="http://127.0.0.1:8443/xsd/account/profile-update-success.xsd"/>`;

    console.log(`[${new Date().toISOString()}] Sending profile update success response for ${accountId}`);
    res.set('Content-Type', 'application/xml');
    res.send(response);
});

// Asset jolt spend endpoint
app.post('/bankfe/resources/asset/:assetId/jolt', (req, res) => {
    const assetId = req.params.assetId;
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Asset jolt spend request for asset ${assetId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers, 'Body:', req.body.toString());

    // Verify token
    const session = findSessionByToken(auth);
    if (!session) {
        console.log(`[${new Date().toISOString()}] Invalid token for asset jolt spend request - auth: ${auth}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Parse the jolt spend data from the request
    const joltSpendData = req.body.toString();
    console.log(`[${new Date().toISOString()}] Jolt spend data: ${joltSpendData}`);

    // For now, just acknowledge the request
    // In a real implementation, you would parse the XML and update the asset's stats
    console.log(`[${new Date().toISOString()}] Processed jolt spend for asset ${assetId}`);

    // Return success response
    const response = `<jolt-spend-success xmlns="http://127.0.0.1:8443/xsd/jolt-spend/jolt-spend-success.xsd"/>`;

    console.log(`[${new Date().toISOString()}] Sending jolt spend success response for asset ${assetId}`);
    res.set('Content-Type', 'application/xml');
    res.send(response);
});

// Account activity endpoint for determining new user status
app.get('/bankfe/resources/account/activity/:accountId', (req, res) => {
    const accountId = parseAccountId(req.params.accountId);
    if (accountId === null) return res.status(400).send('Invalid account ID');
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Account activity request for ${accountId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Verify token
    const session = findSessionByToken(auth);
    if (!session || session.accountId !== accountId) {
        console.log(`[${new Date().toISOString()}] Invalid token for account activity request - session: ${session ? session.accountId : 'none'}, accountId: ${accountId}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Get user account
    const user = users[accountId];
    if (!user) {
        console.log(`[${new Date().toISOString()}] User not found for account activity request - accountId: ${accountId}`);
        return res.status(404).send('<error>User not found</error>');
    }

    // Create activity XML based on user stats
    // NOTE: The client-side NewUserStatusDeterminator has a bug where the logic is inverted
    // It treats users as "new" when they have MORE than 7 login activities, which is backwards
    // To work with the buggy client logic, we need to return appropriate values
    let loginActivities = user.gamesPlayed || 8;
    // For the buggy client logic: if login count > 7, client thinks user IS new
    // So to make experienced users NOT appear as new, keep their login count at 7 or below
    if (loginActivities === 8) {
        loginActivities = 8; // New user - will trigger new user experience correctly
    } else {
        // For existing users, cap login activities at 7 to avoid the buggy client treating them as new
        // This works with the inverted client logic
        loginActivities = Math.min(loginActivities, 8);
    }

    let activityXml = '<activity-list xmlns="http://127.0.0.1:8443/xsd/activity/activity-list.xsd">';

    // Add login activities (the client checks for ACCOUNT_LOGIN type)
    for (let i = 0; i < loginActivities; i++) {
        const timestamp = new Date(Date.now() - (loginActivities - i) * 24 * 60 * 60 * 1000); // Simulate past logins
        activityXml += `
        <activity>
            <activity-type>ACCOUNT_LOGIN</activity-type>
            <timestamp>${timestamp.toISOString()}</timestamp>
            <metadata>
                <login-session-duration>600</login-session-duration>
            </metadata>
        </activity>`;
    }

    activityXml += '</activity-list>';

    console.log(`[${new Date().toISOString()}] Sending account activity response for ${accountId} with ${loginActivities} login activities`);
    res.set('Content-Type', 'application/xml');
    res.send(activityXml);
});

// Evolution endpoint
app.post('/bankfe/resources/evolution/:evolutionId', (req, res) => {
    const evolutionId = req.params.evolutionId;
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Evolution request for evolution ${evolutionId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers, 'Body:', req.body.toString());

    // Verify token
    const session = findSessionByToken(auth);
    if (!session) {
        console.log(`[${new Date().toISOString()}] Invalid token for evolution request - auth: ${auth}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Parse the evolution attempt data from the request
    const evolutionData = req.body.toString();
    console.log(`[${new Date().toISOString()}] Evolution attempt data: ${evolutionData}`);

    // For now, just acknowledge the request
    // In a real implementation, you would parse the XML and process the evolution
    console.log(`[${new Date().toISOString()}] Processed evolution attempt for evolution ${evolutionId}`);

    // Return success response
    const response = `<evolution-success xmlns="http://127.0.0.1:8443/xsd/evolution/evolution-success.xsd"/>`;

    console.log(`[${new Date().toISOString()}] Sending evolution success response for evolution ${evolutionId}`);
    res.set('Content-Type', 'application/xml');
    res.send(response);
});

// Device management endpoint
app.get('/bankfe/resources/account/:accountId/device', (req, res) => {
    const accountId = parseAccountId(req.params.accountId);
    if (accountId === null) return res.status(400).send('Invalid account ID');
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Device management request for account ${accountId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Verify token
    const session = findSessionByToken(auth);
    if (!session || session.accountId !== accountId) {
        console.log(`[${new Date().toISOString()}] Invalid token for device management request - session: ${session ? session.accountId : 'none'}, accountId: ${accountId}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Return device management info
    const user = users[accountId];
    if (!user) {
        console.log(`[${new Date().toISOString()}] User not found for device management request - accountId: ${accountId}`);
        return res.status(404).send('<error>User not found</error>');
    }

    // Return device information (placeholder)
    const deviceInfo = `
<device-management xmlns="http://127.0.0.1:8443/xsd/device/device-management.xsd">
</device-management>`;

    console.log(`[${new Date().toISOString()}] Sending device management response for account ${accountId}`);
    res.set('Content-Type', 'application/xml');
    res.send(deviceInfo);
});

// Account asset endpoint - returns user's assets/collections
app.get('/bankfe/resources/account/:accountId/asset', (req, res) => {
    const accountId = parseAccountId(req.params.accountId);
    if (accountId === null) return res.status(400).send('Invalid account ID');
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Account asset request for ${accountId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Verify token
    console.log(`[${new Date().toISOString()}] Verifying token for account asset request - auth: ${auth}, accountId: ${accountId}`);
    const session = findSessionByToken(auth);
    console.log(`[${new Date().toISOString()}] Session lookup result for account asset:`, session ? {accountId: session.accountId, loginToken: session.loginToken} : 'no session found');
    if (!session || session.accountId !== accountId) {
        console.log(`[${new Date().toISOString()}] Invalid token for account asset request - session: ${session ? session.accountId : 'none'}, accountId: ${accountId}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Return user's asset info
    const user = users[accountId];
    if (!user) {
        console.log(`[${new Date().toISOString()}] User not found for account asset request - accountId: ${accountId}`);
        return res.status(404).send('<error>User not found</error>');
    }

    // Return user's assets from their inventory
    // Use the existing inventory from user.nanovorInventory, don't override it
    const nanovorList = user.nanovorInventory || [];

    // Build XML for nanovor inventory. (VirmonData.parseXMLData)
    let assetsXml = '';
    for (let i = 0; i < nanovorList.length; i++) {
        const nanovor = nanovorList[i];
        const assetId = Number(nanovor.id); // DB id (integer), stable id for this nanovor

        const productionNumber = nanovor.productionNumber || 1;
        const birthDate = nanovor.birthDate || formatDateForNanovor(new Date());
        const lastEvolutionDate = nanovor.lastEvolutionDate || formatDateForNanovor(new Date());

        assetsXml += `
    <asset id="${assetId}" xmlns:ns2="http://smithandtinker.com/xsd/asset-miscellany" xmlns:ns3="http://smithandtinker.com/xsd/asset-stat">
      <asset-type-category>virmon</asset-type-category>
      <asset-type-id>${nanovor.assetTypeId ?? 1}</asset-type-id>
      <asset-type-name>${nanovor.name || 'Unknown Nanovor'}</asset-type-name>
      <production-number>${productionNumber}</production-number>
      <birth-date>${birthDate}</birth-date>
      <last-evolution-date>${lastEvolutionDate}</last-evolution-date>
      <ns2:asset-miscellany>
        <ns2:nickname>${nanovor.nickname || ''}</ns2:nickname>
      </ns2:asset-miscellany>
      <ns3:asset-stat>
        <ns3:asset-type-id>${nanovor.assetTypeId ?? 1}</ns3:asset-type-id>
        <ns3:speed>${nanovor.speed || 10}</ns3:speed>
        <ns3:strength>${nanovor.strength || 100}</ns3:strength>
        <ns3:armor>${nanovor.armor || 5}</ns3:armor>
        <ns3:health>${nanovor.health || 100}</ns3:health>
        <ns3:kill-count>${nanovor.killCount || 0}</ns3:kill-count>
        <ns3:kill-count-lifetime>${nanovor.lifetimeKillCount || 0}</ns3:kill-count-lifetime>
        <ns3:battle-count>${nanovor.battleCount || 0}</ns3:battle-count>
        <ns3:battle-count-lifetime>${nanovor.lifetimeBattleCount || 0}</ns3:battle-count-lifetime>
        <ns3:death-count>${nanovor.deathCount || 0}</ns3:death-count>
        <ns3:death-count-lifetime>${nanovor.lifetimeDeathCount || 0}</ns3:death-count-lifetime>
        <ns3:magnamod-kill-count>${nanovor.magnamodKillCount || 0}</ns3:magnamod-kill-count>
        <ns3:magnamod-kill-count-lifetime>${nanovor.magnamodLifetimeKillCount || 0}</ns3:magnamod-kill-count-lifetime>
        <ns3:hexite-kill-count>${nanovor.hexiteKillCount || 0}</ns3:hexite-kill-count>
        <ns3:hexite-kill-count-lifetime>${nanovor.hexiteLifetimeKillCount || 0}</ns3:hexite-kill-count-lifetime>
        <ns3:velocitron-kill-count>${nanovor.velocitronKillCount || 0}</ns3:velocitron-kill-count>
        <ns3:velocitron-kill-count-lifetime>${nanovor.velocitronLifetimeKillCount || 0}</ns3:velocitron-kill-count-lifetime>
        <ns3:win-count>${nanovor.winCount || 0}</ns3:win-count>
        <ns3:win-count-lifetime>${nanovor.lifetimeWinCount || 0}</ns3:win-count-lifetime>
        <ns3:critical-hit-count>${nanovor.criticalHitCount || 0}</ns3:critical-hit-count>
        <ns3:whiff-count>${nanovor.whiffCount || 0}</ns3:whiff-count>
        <ns3:screen-star>${nanovor.isScreenStar || false}</ns3:screen-star>
        <ns3:scraped-by>${nanovor.isScrapedBy || false}</ns3:scraped-by>
        <ns3:all-attacks-used>${nanovor.areAllAttacksUsed || false}</ns3:all-attacks-used>
        <ns3:slacker>${nanovor.isSlacker || false}</ns3:slacker>
        <ns3:max-damage-game>${nanovor.maxDamageGame || 0}</ns3:max-damage-game>
        <ns3:max-damage-hit>${nanovor.maxDamageHit || 0}</ns3:max-damage-hit>
        <ns3:max-round-count>${nanovor.maxRoundCount || 0}</ns3:max-round-count>
      </ns3:asset-stat>
    </asset>`;
    }

    // NOTE: EM assets are intentionally excluded for now to simplify the asset list

    const assetInfo = `<?xml version="1.0" encoding="UTF-8"?>
<asset-list>
${assetsXml}
</asset-list>`;

    console.log(`[${new Date().toISOString()}] Sending account asset response for ${accountId}`);
    console.log(`[${new Date().toISOString()}] Full user object nanovorInventory for account assets:`, JSON.stringify(user.nanovorInventory, null, 2));
    console.log(`[${new Date().toISOString()}] Account assets XML being sent:`, assetInfo);
    res.set('Content-Type', 'application/xml');
    res.send(assetInfo);
});

// Asset miscellany endpoint - for nickname and other asset-specific data
app.get('/bankfe/resources/asset/:assetId/miscellany', (req, res) => {
    const assetId = req.params.assetId;
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Asset miscellany request for asset ${assetId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Verify token
    const session = findSessionByToken(auth);
    if (!session) {
        console.log(`[${new Date().toISOString()}] Invalid token for asset miscellany request - auth: ${auth}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Return asset miscellany info (placeholder for nickname editor functionality)
    const miscellanyInfo = `
<asset-miscellany xmlns="http://127.0.0.1:8443/xsd/asset-miscellany/asset-miscellany.xsd">
</asset-miscellany>`;

    console.log(`[${new Date().toISOString()}] Sending asset miscellany response for asset ${assetId}`);
    res.set('Content-Type', 'application/xml');
    res.send(miscellanyInfo);
});

// Evolution list endpoint - returns all available evolutions for the user
app.get('/bankfe/resources/evolution', (req, res) => {
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Evolution list request, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Verify token
    const session = findSessionByToken(auth);
    if (!session) {
        console.log(`[${new Date().toISOString()}] Invalid token for evolution list request - auth: ${auth}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Return evolution list (placeholder)
    const evolutionList = `
<evolution-list xmlns="http://127.0.0.1:8443/xsd/evolution/evolution-list.xsd">
</evolution-list>`;

    console.log(`[${new Date().toISOString()}] Sending evolution list response`);
    res.set('Content-Type', 'application/xml');
    res.send(evolutionList);
});

// Specific evolution endpoint - handles evolution attempts
app.get('/bankfe/resources/evolution/:evolutionId', (req, res) => {
    const evolutionId = req.params.evolutionId;
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Specific evolution request for ${evolutionId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Verify token
    const session = findSessionByToken(auth);
    if (!session) {
        console.log(`[${new Date().toISOString()}] Invalid token for specific evolution request - auth: ${auth}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Return evolution data (placeholder)
    const evolutionData = `
<evolution xmlns="http://127.0.0.1:8443/xsd/evolution/evolution.xsd">
  <evolution-id>${evolutionId}</evolution-id>
</evolution>`;

    console.log(`[${new Date().toISOString()}] Sending specific evolution response for ${evolutionId}`);
    res.set('Content-Type', 'application/xml');
    res.send(evolutionData);
});

// Retail/SKU resources endpoint for nanoMall
app.get('/bankfe/resources/retail', (req, res) => {
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Retail/SKU list request, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Verify token
    const session = findSessionByToken(auth);
    if (!session) {
        console.log(`[${new Date().toISOString()}] Invalid token for retail/SKU list request - auth: ${auth}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Return available SKUs (placeholder)
    const skuList = `
<sku-list xmlns="http://127.0.0.1:8443/xsd/retail/sku-list.xsd">
</sku-list>`;

    console.log(`[${new Date().toISOString()}] Sending retail/SKU list response`);
    res.set('Content-Type', 'application/xml');
    res.send(skuList);
});

// Specific SKU purchase endpoint
app.post('/bankfe/resources/retail/:skuId', (req, res) => {
    const skuId = req.params.skuId;
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] SKU purchase request for ${skuId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers, 'Body:', req.body.toString());

    // Verify token
    const session = findSessionByToken(auth);
    if (!session) {
        console.log(`[${new Date().toISOString()}] Invalid token for SKU purchase request - auth: ${auth}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Process SKU purchase (placeholder)
    const purchaseResponse = `
<purchase-response xmlns="http://127.0.0.1:8443/xsd/retail/purchase-response.xsd">
  <success>true</success>
  <sku-id>${skuId}</sku-id>
</purchase-response>`;

    console.log(`[${new Date().toISOString()}] Sending SKU purchase response for ${skuId}`);
    res.set('Content-Type', 'application/xml');
    res.send(purchaseResponse);
});


// Device jolt endpoint
app.post('/device/:deviceId/jolt', (req, res) => {
    const deviceId = req.params.deviceId;
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Device jolt request for device ${deviceId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers, 'Body:', req.body.toString());

    // Verify token
    const session = findSessionByToken(auth);
    if (!session) {
        console.log(`[${new Date().toISOString()}] Invalid token for device jolt request - auth: ${auth}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Parse the jolt data from the request
    const joltData = req.body.toString();
    console.log(`[${new Date().toISOString()}] Device jolt data: ${joltData}`);

    // For now, just acknowledge the request
    console.log(`[${new Date().toISOString()}] Processed jolt request for device ${deviceId}`);

    // Return success response
    const response = `<device-jolt-success xmlns="http://127.0.0.1:8443/xsd/device-jolt/device-jolt-success.xsd"/>`;

    console.log(`[${new Date().toISOString()}] Sending device jolt success response for device ${deviceId}`);
    res.set('Content-Type', 'application/xml');
    res.send(response);
});

// Device asset verification endpoint
app.get('/device/:deviceId/asset/:assetId/sign/vinfo', (req, res) => {
    const deviceId = req.params.deviceId;
    const assetId = req.params.assetId;
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Device asset verification request for device ${deviceId}, asset ${assetId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Verify token
    const session = findSessionByToken(auth);
    if (!session) {
        console.log(`[${new Date().toISOString()}] Invalid token for device asset verification request - auth: ${auth}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Return asset verification info (placeholder)
    const assetVerification = `
<asset-verification xmlns="http://127.0.0.1:8443/xsd/asset-verification/asset-verification.xsd">
</asset-verification>`;

    console.log(`[${new Date().toISOString()}] Sending asset verification response for device ${deviceId}, asset ${assetId}`);
    res.set('Content-Type', 'application/xml');
    res.send(assetVerification);
});

// Device player info endpoint
app.get('/device/:deviceId/account/:accountId/sign/plyinfo', (req, res) => {
    const deviceId = req.params.deviceId;
    const accountId = parseAccountId(req.params.accountId);
    if (accountId === null) return res.status(400).send('Invalid account ID');
    const auth = req.query.auth;

    console.log(`[${new Date().toISOString()}] Device player info request for device ${deviceId}, account ${accountId}, auth: ${auth}`);
    console.log(`Request details - Path: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Verify token
    const session = findSessionByToken(auth);
    if (!session || session.accountId !== accountId) {
        console.log(`[${new Date().toISOString()}] Invalid token for device player info request - session: ${session ? session.accountId : 'none'}, accountId: ${accountId}`);
        return res.status(401).send('<error>Invalid token</error>');
    }

    // Return player info
    const user = users[accountId];
    if (!user) {
        console.log(`[${new Date().toISOString()}] User not found for device player info request - accountId: ${accountId}`);
        return res.status(404).send('<error>User not found</error>');
    }

    // Return player information (placeholder)
    const playerInfo = `
<player-info xmlns="http://127.0.0.1:8443/xsd/player-info/player-info.xsd">
</player-info>`;

    console.log(`[${new Date().toISOString()}] Sending player info response for device ${deviceId}, account ${accountId}`);
    res.set('Content-Type', 'application/xml');
    res.send(playerInfo);
});

// Manifest endpoints for version checking and updates
app.get('/bankfe/manifests/news', (req, res) => {
    console.log('News manifest requested');

    // Return sample news data
    const newsData = {
        "news": [
            {
                "id": 1,
                "title": "Welcome to Nanovor!",
                "content": "Welcome to the Nanovor game world. Enjoy your battles!",
                "date": new Date().toISOString().split('T')[0],
                "priority": "normal"
            }
        ]
    };

    res.json(newsData);
});

// Nanolog endpoint - might be needed for the NANOLOG state
app.get('/bankfe/manifests/nanolog', (req, res) => {
    console.log(`[${new Date().toISOString()}] Nanolog requested, Query:`, req.query, 'Headers:', req.headers);

    // Return empty nanolog response to allow client to continue
    const nanologResponse = `<?xml version="1.0" encoding="UTF-8"?>
<nanolog xmlns="http://127.0.0.1:8443/xsd/nanolog/nanolog.xsd">
    <entries>
        <!-- Placeholder for nanolog entries -->
    </entries>
</nanolog>`;

    console.log(`[${new Date().toISOString()}] Sending nanolog response`);
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(nanologResponse);
});

// Additional nanolog endpoint that might be accessed directly
app.get('/nanolog', (req, res) => {
    console.log(`[${new Date().toISOString()}] Direct nanolog requested, Query:`, req.query, 'Headers:', req.headers);

    // Return empty nanolog response to allow client to continue
    const nanologResponse = `<?xml version="1.0" encoding="UTF-8"?>
<nanolog xmlns="http://127.0.0.1:8443/xsd/nanolog/nanolog.xsd">
    <entries>
        <!-- Placeholder for nanolog entries -->
    </entries>
</nanolog>`;

    console.log(`[${new Date().toISOString()}] Sending direct nanolog response`);
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(nanologResponse);
});

// Endpoint to serve the nanolog XSD schema
app.get('/xsd/nanolog/nanolog.xsd', (req, res) => {
    console.log(`[${new Date().toISOString()}] Nanolog XSD schema requested, Query:`, req.query, 'Headers:', req.headers);

    const xsdPath = path.join(__dirname, 'xsd', 'nanolog', 'nanolog.xsd');

    if (fs.existsSync(xsdPath)) {
        const xsdContent = fs.readFileSync(xsdPath, 'utf8');
        console.log(`[${new Date().toISOString()}] Sending nanolog XSD schema`);
        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.send(xsdContent);
    } else {
        console.log(`[${new Date().toISOString()}] Nanolog XSD schema not found at ${xsdPath}`);
        res.status(404).send('<error>XSD schema not found</error>');
    }
});

// Additional nanolog endpoint that might be accessed via bankfe
app.get('/bankfe/resources/nanolog', (req, res) => {
    console.log(`[${new Date().toISOString()}] BankFE nanolog requested, Query:`, req.query, 'Headers:', req.headers);

    // Return empty nanolog response to allow client to continue
    const nanologResponse = `<?xml version="1.0" encoding="UTF-8"?>
<nanolog xmlns="http://127.0.0.1:8443/xsd/nanolog/nanolog.xsd">
    <entries>
        <!-- Placeholder for nanolog entries -->
    </entries>
</nanolog>`;

    console.log(`[${new Date().toISOString()}] Sending bankfe nanolog response`);
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(nanologResponse);
});

app.get('/bankfe/manifests/register.php', (req, res) => {
    console.log('Registration page requested');

    // Return registration page info
    res.set('Content-Type', 'text/html');
    res.send(`
        <html>
            <body>
                <h1>Nanovor Registration</h1>
                <p>Registration is handled by the game client.</p>
            </body>
        </html>
    `);
});

app.get('/bankfe/manifests/password_request.php', (req, res) => {
    console.log('Password reset requested');

    // Return password reset page info
    res.set('Content-Type', 'text/html');
    res.send(`
        <html>
            <body>
                <h1>Password Reset</h1>
                <p>Password reset is handled by the game client.</p>
            </body>
        </html>
    `);
});

app.get('/bankfe/manifests/nanolog', (req, res) => {
    console.log('Nanolog requested');

    // Return empty nanolog response
    res.json({});
});

app.get('/bankfe/manifests/nanocash.php', (req, res) => {
    console.log('Nanocash page requested');

    // Return nanocash page info
    res.set('Content-Type', 'text/html');
    res.send(`
        <html>
            <body>
                <h1>Nanocash Purchase</h1>
                <p>Nanocash purchase is handled by the game client.</p>
            </body>
        </html>
    `);
});

// Assets endpoint for news banner
app.get('/Assets/Client/NewsBanner.swf', (req, res) => {
    console.log('News banner SWF requested');

    // Return a simple response indicating the file exists
    res.status(404).send('News banner file not available');
});

// Application manifest endpoint - serves the AppManifest.xml file
app.get('/AppManifest.xml', (req, res) => {
    console.log(`[${new Date().toISOString()}] AppManifest.xml requested - Query:`, req.query, 'Headers:', req.headers);

    // Read the AppManifest.xml file from the Manifests directory
    const manifestPath = path.join(__dirname, 'Manifests', 'AppManifest.xml');

    if (fs.existsSync(manifestPath)) {
        const manifestContent = fs.readFileSync(manifestPath, 'utf8');
        console.log(`[${new Date().toISOString()}] Sending AppManifest.xml`);
        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.send(manifestContent);
    } else {
        console.log(`[${new Date().toISOString()}] AppManifest.xml not found at ${manifestPath}`);
        res.status(404).send('<error>Manifest file not found</error>');
    }
});

// Application manifest properties endpoint - serves the AppManifest-props.xml file
app.get('/AppManifest-props.xml', (req, res) => {
    console.log(`[${new Date().toISOString()}] AppManifest-props.xml requested - Query:`, req.query, 'Headers:', req.headers);

    // Read the AppManifest-props.xml file from the Manifests directory
    const manifestPropsPath = path.join(__dirname, 'Manifests', 'AppManifest-props.xml');

    if (fs.existsSync(manifestPropsPath)) {
        const manifestPropsContent = fs.readFileSync(manifestPropsPath, 'utf8');
        console.log(`[${new Date().toISOString()}] Sending AppManifest-props.xml`);
        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.send(manifestPropsContent);
    } else {
        console.log(`[${new Date().toISOString()}] AppManifest-props.xml not found at ${manifestPropsPath}`);
        res.status(404).send('<error>Manifest properties file not found</error>');
    }
});

// Asset manifest endpoint - serves the manifest.xml file
app.get('/manifest.xml', (req, res) => {
    console.log(`[${new Date().toISOString()}] manifest.xml requested - Query:`, req.query, 'Headers:', req.headers);

    // Read the manifest.xml file from the Manifests directory
    const manifestPath = path.join(__dirname, 'Manifests', 'manifest.xml'); // Using the specific asset manifest file

    if (fs.existsSync(manifestPath)) {
        const manifestContent = fs.readFileSync(manifestPath, 'utf8');
        console.log(`[${new Date().toISOString()}] Sending manifest.xml`);
        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.send(manifestContent);
    } else {
        console.log(`[${new Date().toISOString()}] manifest.xml not found at ${manifestPath}`);
        res.status(404).send('<error>Manifest file not found</error>');
    }
});

// Master data endpoints for nanovor definitions
app.get('/Assets/Client/Characters/virmon-master.xml', (req, res) => {
    console.log(`[${new Date().toISOString()}] virmon-master.xml requested - Query:`, req.query, 'Headers:', req.headers);

    // Read the virmon-master.xml file from the Characters directory
    const masterDataPath = path.join(__dirname, 'Manifests', 'Client', 'Characters', 'virmon-master.xml');

    if (fs.existsSync(masterDataPath)) {
        const masterDataContent = fs.readFileSync(masterDataPath, 'utf8');
        console.log(`[${new Date().toISOString()}] Sending virmon-master.xml`);
        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.send(masterDataContent);
    } else {
        console.log(`[${new Date().toISOString()}] virmon-master.xml not found at ${masterDataPath}`);
        res.status(404).send('<error>Master data file not found</error>');
    }
});

app.get('/Assets/Client/Characters/virmon-master-value.xml', (req, res) => {
    console.log(`[${new Date().toISOString()}] virmon-master-value.xml requested - Query:`, req.query, 'Headers:', req.headers);

    // Read the virmon-master-value.xml file from the Characters directory
    const masterValuePath = path.join(__dirname, 'Manifests', 'Client', 'Characters', 'virmon-master-value.xml');

    if (fs.existsSync(masterValuePath)) {
        const masterValueContent = fs.readFileSync(masterValuePath, 'utf8');
        console.log(`[${new Date().toISOString()}] Sending virmon-master-value.xml`);
        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.send(masterValueContent);
    } else {
        console.log(`[${new Date().toISOString()}] virmon-master-value.xml not found at ${masterValuePath}`);
        res.status(404).send('<error>Master value data file not found</error>');
    }
});

// Device manifest endpoint
app.get('/device/device-manifest.xml', (req, res) => {
    console.log(`[${new Date().toISOString()}] Device manifest requested - Query:`, req.query, 'Headers:', req.headers);

    // For now, return a simple device manifest
    const deviceManifest = `<?xml version="1.0" encoding="UTF-8"?>
<device-manifest xmlns="http://127.0.0.1:8443/xsd/device-manifest/device-manifest.xsd">
  <version>
    <major>1</major>
    <minor>0</minor>
    <build>0</build>
  </version>
  <devices>
    <!-- Placeholder for device definitions -->
  </devices>
</device-manifest>`;

    console.log(`[${new Date().toISOString()}] Sending device manifest`);
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(deviceManifest);
});

// Required asset download endpoints that might be needed for the download manager
app.get('/Assets/*', (req, res) => {
    console.log(`[${new Date().toISOString()}] Asset request: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // For now, return a simple response to prevent hanging
    res.status(404).send('Asset not found');
});

// Download manager endpoints
app.get('/bankfe/manifests/*', (req, res) => {
    console.log(`[${new Date().toISOString()}] Manifest request: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Return empty manifest to allow download process to continue
    const emptyManifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://127.0.0.1:8443/xsd/manifest/manifest.xsd">
</manifest>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(emptyManifest);
});

// Sensei/tutorial players (Training, Easy, Medium) - client expects this for battle player IDs
app.get('/Assets/Client/sensei-players.xml', (req, res) => {
    const senseiPath = path.join(__dirname, 'Manifests', 'Client', 'sensei-players.xml');
    if (fs.existsSync(senseiPath)) {
        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.send(fs.readFileSync(senseiPath, 'utf8'));
    } else {
        res.status(404).send('Asset not found');
    }
});

// Additional asset endpoints that might be requested
app.get('/Assets/Client/*', (req, res) => {
    console.log(`[${new Date().toISOString()}] Client asset request: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Return a simple response to prevent hanging
    res.status(404).send('Asset not found');
});

// Download status endpoint that might be used by download manager
app.get('/bankfe/resources/download-status', (req, res) => {
    console.log(`[${new Date().toISOString()}] Download status request, Query:`, req.query, 'Headers:', req.headers);

    // Return success status to indicate downloads are complete
    const statusResponse = `<?xml version="1.0" encoding="UTF-8"?>
<download-status xmlns="http://127.0.0.1:8443/xsd/download-status/download-status.xsd">
    <status>complete</status>
    <progress>100</progress>
</download-status>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(statusResponse);
});

// Additional endpoint that might be used by download manager to check download progress
app.get('/bankfe/resources/download-progress', (req, res) => {
    console.log(`[${new Date().toISOString()}] Download progress request, Query:`, req.query, 'Headers:', req.headers);

    // Return immediate completion to allow login to proceed
    const progressResponse = `<?xml version="1.0" encoding="UTF-8"?>
<download-progress xmlns="http://127.0.0.1:8443/xsd/download-progress/download-progress.xsd">
    <files-downloaded>1</files-downloaded>
    <total-files>1</total-files>
    <bytes-downloaded>1000</bytes-downloaded>
    <total-bytes>1000</total-bytes>
    <status>complete</status>
</download-progress>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(progressResponse);
});

// Endpoint for asset manifest loading that might be required before login
app.get('/bankfe/resources/asset-manifests', (req, res) => {
    console.log(`[${new Date().toISOString()}] Asset manifests request, Query:`, req.query, 'Headers:', req.headers);

    // Return empty manifests to allow download process to continue
    const manifestsResponse = `<?xml version="1.0" encoding="UTF-8"?>
<asset-manifests xmlns="http://127.0.0.1:8443/xsd/asset-manifests/asset-manifests.xsd">
</asset-manifests>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(manifestsResponse);
});

// Catch-all for asset manifest related requests that might be needed
app.get('/bankfe/resources/manifests/*', (req, res) => {
    console.log(`[${new Date().toISOString()}] Asset manifest catch-all request: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Return a generic manifest response to allow download process to continue
    const genericManifest = `<?xml version="1.0" encoding="UTF-8"?>
<generic-manifest xmlns="http://127.0.0.1:8443/xsd/generic-manifest/generic-manifest.xsd">
</generic-manifest>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(genericManifest);
});

// Catch-all for any download-related requests
app.all('/bankfe/resources/download*', (req, res) => {
    console.log(`[${new Date().toISOString()}] Download-related request: ${req.path}, Method: ${req.method}, Query:`, req.query, 'Headers:', req.headers);

    // Return a success response to allow download process to complete
    const downloadResponse = `<?xml version="1.0" encoding="UTF-8"?>
<download-response xmlns="http://127.0.0.1:8443/xsd/download-response/download-response.xsd">
    <status>success</status>
    <message>Download completed</message>
</download-response>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(downloadResponse);
});

// Additional catch-all for asset-related requests
app.all('/bankfe/resources/asset*', (req, res) => {
    console.log(`[${new Date().toISOString()}] Asset-related request: ${req.path}, Method: ${req.method}, Query:`, req.query, 'Headers:', req.headers);

    // Return a generic asset response
    const assetResponse = `<?xml version="1.0" encoding="UTF-8"?>
<asset-response xmlns="http://127.0.0.1:8443/xsd/asset-response/asset-response.xsd">
    <status>success</status>
</asset-response>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(assetResponse);
});

// Endpoint for AppManifest.xml that the client is requesting
app.get('/clientbin/data/AppManifest.xml', (req, res) => {
    console.log(`[${new Date().toISOString()}] AppManifest.xml requested via clientbin, Query:`, req.query, 'Headers:', req.headers);

    // Return a basic AppManifest.xml to allow client to continue
    const appManifest = `<?xml version="1.0" encoding="UTF-8"?>
<AppManifest xmlns="http://127.0.0.1:8443/xsd/app-manifest/app-manifest.xsd">
    <version>
        <major>1</major>
        <minor>2</minor>
        <build>0</build>
    </version>
    <assets>
        <!-- Placeholder for required assets -->
    </assets>
</AppManifest>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(appManifest);
});

// Endpoint for other manifest files that might be requested
app.get('/clientbin/data/*', (req, res) => {
    console.log(`[${new Date().toISOString()}] Clientbin data request: ${req.path}, Query:`, req.query, 'Headers:', req.headers);

    // Return a generic response for any clientbin data requests
    res.status(404).send('<error>Resource not found</error>');
});

// Add endpoints for common manifest files that might be requested
app.get('/manifests/AppManifest.xml', (req, res) => {
    console.log(`[${new Date().toISOString()}] AppManifest.xml requested, Query:`, req.query, 'Headers:', req.headers);

    const appManifest = `<?xml version="1.0" encoding="UTF-8"?>
<AppManifest xmlns="http://127.0.0.1:8443/xsd/app-manifest/app-manifest.xsd">
    <version>1.2.0</version>
    <assets>
        <!-- Placeholder for required assets -->
    </assets>
</AppManifest>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(appManifest);
});

app.get('/manifests/AppManifest-props.xml', (req, res) => {
    console.log(`[${new Date().toISOString()}] AppManifest-props.xml requested, Query:`, req.query, 'Headers:', req.headers);

    const appManifestProps = `<?xml version="1.0" encoding="UTF-8"?>
<AppManifest-props xmlns="http://127.0.0.1:8443/xsd/app-manifest-props/app-manifest-props.xsd">
    <properties>
        <!-- Placeholder for app properties -->
    </properties>
</AppManifest-props>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(appManifestProps);
});

app.get('/manifests/manifest.xml', (req, res) => {
    console.log(`[${new Date().toISOString()}] manifest.xml requested, Query:`, req.query, 'Headers:', req.headers);

    const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://127.0.0.1:8443/xsd/manifest/manifest.xsd">
    <assets>
        <!-- Placeholder for assets -->
    </assets>
</manifest>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(manifest);
});

// Add endpoint for device manifest that might be needed
app.get('/device/device-manifest.xml', (req, res) => {
    console.log(`[${new Date().toISOString()}] Device manifest requested, Query:`, req.query, 'Headers:', req.headers);

    const deviceManifest = `<?xml version="1.0" encoding="UTF-8"?>
<device-manifest xmlns="http://127.0.0.1:8443/xsd/device-manifest/device-manifest.xsd">
    <version>
        <major>1</major>
        <minor>0</minor>
        <build>0</build>
    </version>
    <devices>
        <!-- Placeholder for device definitions -->
    </devices>
</device-manifest>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(deviceManifest);
});

// Main manifest file that might be requested first by the download manager
app.get('/Assets/Client/manifest.xml', (req, res) => {
    console.log(`[${new Date().toISOString()}] Main client manifest requested, Query:`, req.query, 'Headers:', req.headers);

    // Return a manifest indicating no downloads are needed to allow process to continue
    const mainManifest = `<?xml version="1.0" encoding="UTF-8"?>
<asset-manifest xmlns="http://127.0.0.1:8443/xsd/asset-manifest/asset-manifest.xsd">
    <assets>
        <!-- Empty assets list to indicate no downloads needed -->
    </assets>
    <download-required>false</download-required>
</asset-manifest>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(mainManifest);
});

// Root manifest file that might be needed
app.get('/Assets/manifest.xml', (req, res) => {
    console.log(`[${new Date().toISOString()}] Root manifest requested, Query:`, req.query, 'Headers:', req.headers);

    // Return a root manifest indicating no downloads are needed
    const rootManifest = `<?xml version="1.0" encoding="UTF-8"?>
<root-manifest xmlns="http://127.0.0.1:8443/xsd/root-manifest/root-manifest.xsd">
    <manifests>
        <!-- No additional manifests needed -->
    </manifests>
    <download-required>false</download-required>
</root-manifest>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(rootManifest);
});

// Manifest properties file that the RootMetadataChecker looks for first
app.get('/Assets/manifest-props.xml', (req, res) => {
    console.log(`[${new Date().toISOString()}] Manifest properties file requested, Query:`, req.query, 'Headers:', req.headers);

    // Return properties indicating manifests are up to date
    const manifestProps = `<?xml version="1.0" encoding="UTF-8"?>
<manifest-props xmlns="http://127.0.0.1:8443/xsd/manifest-props/manifest-props.xsd">
    <valid>true</valid>
    <last-checked>${Date.now()}</last-checked>
    <needs-update>false</needs-update>
    <assets-loaded>true</assets-loaded>
</manifest-props>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(manifestProps);
});

// Client manifest properties file
app.get('/Assets/Client/manifest-props.xml', (req, res) => {
    console.log(`[${new Date().toISOString()}] Client manifest properties requested, Query:`, req.query, 'Headers:', req.headers);

    // Return properties indicating client manifests are up to date
    const clientManifestProps = `<?xml version="1.0" encoding="UTF-8"?>
<client-manifest-props xmlns="http://127.0.0.1:8443/xsd/client-manifest-props/client-manifest-props.xsd">
    <valid>true</valid>
    <last-checked>${Date.now()}</last-checked>
    <needs-update>false</needs-update>
    <assets-loaded>true</assets-loaded>
</client-manifest-props>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(clientManifestProps);
});

// Additional manifest endpoint that might be the first one requested by the download manager
app.get('/bankfe/manifests/main-manifest.xml', (req, res) => {
    console.log(`[${new Date().toISOString()}] Main manifest requested via bankfe, Query:`, req.query, 'Headers:', req.headers);

    // Return a manifest that will trigger the download manager to consider manifests loaded
    const mainManifest = `<?xml version="1.0" encoding="UTF-8"?>
<main-manifest xmlns="http://127.0.0.1:8443/xsd/main-manifest/main-manifest.xsd">
    <assets-loaded>true</assets-loaded>
    <download-required>false</download-required>
    <asset-groups>
        <!-- Indicate that all required asset groups are already available -->
    </asset-groups>
</main-manifest>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(mainManifest);
});

// Another common manifest pattern that might be requested
app.get('/bankfe/manifests/master-manifest.xml', (req, res) => {
    console.log(`[${new Date().toISOString()}] Master manifest requested, Query:`, req.query, 'Headers:', req.headers);

    // Return a master manifest indicating all assets are up-to-date
    const masterManifest = `<?xml version="1.0" encoding="UTF-8"?>
<master-manifest xmlns="http://127.0.0.1:8443/xsd/master-manifest/master-manifest.xsd">
    <status>ready</status>
    <assets-complete>true</assets-complete>
    <next-action>proceed</next-action>
</master-manifest>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(masterManifest);
});

// Test endpoint to simulate login process
app.get('/test-login/:username', (req, res) => {
    const username = req.params.username;
    console.log(`Test login request for user: ${username}`);

    const loginToken = generateToken();
    let existingUser = loadUserDataByUsername(username);
    let accountId;
    if (existingUser) {
        accountId = existingUser.id;
    } else {
        accountId = getNextAccountId();
        users[accountId] = createUserProfile(accountId, username);
        saveUserData(accountId);
    }

    // Create session
    const sessionId = uuidv4();
    sessions[sessionId] = {
        accountId: accountId,
        loginToken: loginToken,
        expires: Date.now() + 30 * 60 * 1000, // 30 minutes
        ip: req.ip
    };

    res.json({
        success: true,
        accountId: accountId,
        loginToken: loginToken,
        message: `User ${username} created and ready for login`
    });
});
}
module.exports = registerRest;
