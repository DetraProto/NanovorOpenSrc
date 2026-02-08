/**
 * Main Nanovor Server Implementation
 * Emulates the original SmartFoxServer and Service Request Broker (SRB) architecture
 */

const express = require('express');
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Import helper modules
const { parseString } = require('xml2js');
const { create } = require('xmlbuilder2');

// Shared state and business logic (split modules)
const state = require('./state');
const { users, sessions, gameRooms, gameStates, socketMap, battleRooms } = state;
const user = require('./user');
const srb = require('./lib/srb');
const utils = require('./lib/utils');
const config = require('./config');
const gameRoomsModule = require('./gameRooms');
const battle = require('./battle');

const { findSessionByToken, createUserProfile, saveUserData, loadUserDataByUsername, loadUserData, loadAllUserData } = user;
const { extractParamsFromRequest, createSrbResponse } = srb;
const { generateToken } = utils;
const { createGameRoom, getUserGameRoom, advanceTurn } = gameRoomsModule;
const { sendMessageToUser, broadcastToBattle } = battle;

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Middleware for XML-RPC endpoint specifically for SRB
app.use('/xmlrpc', express.raw({ type: 'text/xml', limit: '10mb' }));
app.use('/xmlrpc', express.raw({ type: 'application/xml', limit: '10mb' }));
app.use('/xmlrpc', express.raw({ type: '*/*', limit: '10mb' })); // Catch-all for xmlrpc in case content-type varies

// General middleware for other endpoints (avoid raw middleware that interferes with GET requests)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ type: 'text/plain', limit: '10mb' }));

console.log('Starting Nanovor Server...');

const versionInfo = config.versionInfo;
const connectionSettings = config.connectionSettings;
const loginScreenConfig = config.loginScreenConfig;

console.log(`Server version: ${versionInfo.major || '0'}.${versionInfo.minor || '0'}.${versionInfo.build || '0'}`);


// Register all HTTP routes
require('./routes')(app);

// SmartFoxServer TCP Socket Implementation
const { createSfsServer, sfsPort } = require('./sfs/server');
const sfsServer = createSfsServer();

loadAllUserData();

// Start servers with error handling
const httpPort = 8443;

server.listen(httpPort, () => {
    console.log(`HTTP server running on port ${httpPort}`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${httpPort} is already in use. Please stop the existing server first.`);
    } else {
        console.error('HTTP server error:', err);
    }
    process.exit(1);
});

sfsServer.listen(sfsPort, () => {
    console.log(`SmartFoxServer emulator running on port ${sfsPort}`);
});

sfsServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${sfsPort} is already in use. Please stop the existing server first.`);
    } else {
        console.error('SmartFoxServer error:', err);
    }
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down servers...');

    // Save all user data before shutting down
    for (const userId in users) {
        saveUserData(userId);
    }

    server.close(() => console.log('HTTP server closed'));
    sfsServer.close(() => console.log('SFS server closed'));
    process.exit(0);
});

console.log('Nanovor Server started successfully!');