/**
 * Service Request Broker (SRB) - XML-RPC login/connect.
 */

const { v4: uuidv4 } = require('uuid');
const state = require('../state');
const user = require('../user');
const srb = require('../lib/srb');
const utils = require('../lib/utils');

const { users, getNextAccountId } = state;
const { extractParamsFromRequest, createSrbResponse } = srb;
const { generateToken } = utils;
const { createUserProfile, saveUserData, loadUserDataByUsername } = user;

function registerSrb(app) {
    app.post('/xmlrpc', (req, res) => {
        console.log(`[${new Date().toISOString()}] SRB Request received:`, typeof req.body);
        console.log(`Request details - Path: ${req.path}, Headers:`, req.headers);

        let requestBody;
        if (Buffer.isBuffer(req.body)) {
            requestBody = req.body.toString();
        } else if (typeof req.body === 'object') {
            if (req.body.xml && typeof req.body.xml === 'string') {
                requestBody = req.body.xml;
            } else if (Object.keys(req.body).length === 1 && typeof Object.values(req.body)[0] === 'string') {
                requestBody = Object.values(req.body)[0];
            } else if (JSON.stringify(req.body).includes('<methodCall>') || JSON.stringify(req.body).includes('<methodName>')) {
                requestBody = JSON.stringify(req.body);
            } else {
                requestBody = Object.keys(req.body).map(key => `${key}=${req.body[key]}`).join('&');
                if (requestBody.startsWith('xml=')) {
                    requestBody = requestBody.substring(4);
                    requestBody = decodeURIComponent(requestBody);
                } else if (requestBody.includes('<methodCall>')) {
                    const xmlMatch = requestBody.match(/<methodCall>[\s\S]*<\/methodCall>/);
                    if (xmlMatch) requestBody = xmlMatch[0];
                }
            }
        } else {
            requestBody = req.body.toString();
        }

        console.log(`[${new Date().toISOString()}] Parsed SRB request body:`, requestBody.substring(0, 200) + '...');

        if (requestBody.includes('<methodName>srb.Connect</methodName>') || requestBody.includes('srb.Connect')) {
            const params = extractParamsFromRequest(requestBody);
            console.log(`[${new Date().toISOString()}] Extracted SRB parameters:`, params);
            console.log(`[${new Date().toISOString()}] Request body preview:`, requestBody.substring(0, 500) + '...');

            const loginToken = generateToken();
            console.log(`[${new Date().toISOString()}] SRB params received:`, params);
            const username = params.playername || 'n';
            console.log(`[${new Date().toISOString()}] Using username: '${username}' (from params: '${params.playername}')`);

            let existingUser = loadUserDataByUsername(username);
            let accountId;
            if (existingUser) {
                accountId = existingUser.id;
                console.log(`[${new Date().toISOString()}] Existing user ${username} (accountId: ${accountId})`);
            } else {
                accountId = getNextAccountId();
                users[accountId] = createUserProfile(accountId, username);
                saveUserData(accountId);
                console.log(`[${new Date().toISOString()}] Created new user ${username} (accountId: ${accountId})`);
            }

            const sessionId = uuidv4();
            state.sessions[sessionId] = {
                accountId,
                username,  // Store the username in the session
                loginToken,
                expires: Date.now() + 30 * 60 * 1000,
                ip: req.ip
            };

            console.log(`[${new Date().toISOString()}] Created session for user ${username} (accountId: ${accountId}), session ID: ${sessionId}`);

            const srbResponse = createSrbResponse(accountId, loginToken);
            res.set('Content-Type', 'application/xml; charset=utf-8');
            res.send(srbResponse);
            console.log(`[${new Date().toISOString()}] SRB Response sent successfully for user ${username} (accountId: ${accountId})`);
        } else {
            console.log(`[${new Date().toISOString()}] Unsupported SRB method:`, requestBody);
            res.status(400).send('Unsupported method');
        }
    });
}

module.exports = registerSrb;
