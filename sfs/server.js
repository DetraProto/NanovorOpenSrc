const net = require('net');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const state = require('../state');
const user = require('../user');
const handleXmlMessage = require('./handlers/xml');
const handleJsonMessage = require('./handlers/json');
const handleStringMessage = require('./handlers/string');
const { users, gameRooms, battleRooms, socketMap } = state;
const { saveUserData } = user;

const sfsPort = 9339;

function createSfsServer() {
  return net.createServer((socket) => {
    console.log('=== NEW SMARTFOXSERVER CONNECTION ===');
    console.log('New SmartFoxServer connection from:', socket.remoteAddress);
    console.log('Remote address:', socket.remoteAddress, 'Remote port:', socket.remotePort);
    console.log('Local address:', socket.localAddress, 'Local port:', socket.localPort);

    // Store socket reference
    socket.id = uuidv4();
    socket.loggedIn = false;
    socket.userId = null;
    socket.userName = null;
    socket.activeRoomId = -1;
    socket.activeBattle = null;

    socket.on('data', (data) => {
        const message = data.toString();
        console.log(`>>> SFS DATA RECEIVED from ${socket.remoteAddress}:${socket.remotePort} >>>`);
        console.log(`Message length: ${message.length}, Raw: ${message.substring(0, 200)}...`);
        console.log(`Socket state - loggedIn: ${socket.loggedIn}, userId: ${socket.userId}, userName: ${socket.userName}, activeRoomId: ${socket.activeRoomId}`);

        // Check if this is an HTTP request (starts with GET, POST, etc.)
        if (message.startsWith('GET ') || message.startsWith('POST ') || message.startsWith('PUT ') || message.startsWith('DELETE ') || message.startsWith('HEAD ')) {
            console.log('*** HTTP REQUEST DETECTED ***');
            console.log('Client is sending HTTP request to SmartFoxServer port - this is likely a manifest download attempt');

            // Parse the HTTP request to get the path
            const lines = message.split('\r\n');
            const requestLine = lines[0];
            const pathMatch = requestLine.match(/^GET (\S+)/);

            if (pathMatch) {
                const path = pathMatch[1];

                // Handle manifest file requests by serving from the Manifests directory
                if (path.includes('AppManifest.xml')) {
                    console.log('Serving AppManifest.xml from Manifests directory');

                    // Read the actual AppManifest.xml file from the Manifests directory
                    const fs = require('fs');
                    const pathModule = require('path');

                    try {
                        // Map the client request path to the server's Manifests directory
                        let filePath = pathModule.join(__dirname, '..', 'Manifests', 'AppManifest.xml');

                        // Check if the file exists
                        if (fs.existsSync(filePath)) {
                            const fileContent = fs.readFileSync(filePath, 'utf8');

                            const httpResponse = 'HTTP/1.1 200 OK\r\n' +
                                               'Content-Type: application/xml\r\n' +
                                               'Content-Length: ' + Buffer.byteLength(fileContent, 'utf8') + '\r\n' +
                                               'Connection: keep-alive\r\n' +
                                               '\r\n' +
                                               fileContent;

                            socket.write(httpResponse);
                            console.log('Sent actual AppManifest.xml from Manifests directory');
                            return;
                        } else {
                            console.log('AppManifest.xml not found in Manifests directory, sending default');
                            // Fall back to default response if file doesn't exist
                        }
                    } catch (error) {
                        console.error('Error reading AppManifest.xml:', error);
                        // Fall back to default response if there's an error
                    }
                }
                // Handle other manifest file requests
                else if (path.includes('/clientbin/data/') || path.includes('manifest')) {
                    console.log(`Serving manifest file from path: ${path}`);

                    const fs = require('fs');
                    const pathModule = require('path');

                    try {
                        // Extract filename from the path (remove query parameters)
                        const cleanPath = path.split('?')[0]; // Remove query parameters like ?killcache=...
                        const fileName = cleanPath.split('/').pop();

                        // Try multiple possible locations for the manifest file
                        let filePath = null;

                        // First, try the main Manifests directory
                        filePath = pathModule.join(__dirname, '..', 'Manifests', fileName);
                        if (!fs.existsSync(filePath)) {
                            // Then try the Assets subdirectory
                            filePath = pathModule.join(__dirname, '..', 'Manifests', 'Assets', fileName);
                            if (!fs.existsSync(filePath)) {
                                // Then try the Assets/Client subdirectory
                                filePath = pathModule.join(__dirname, '..', 'Manifests', 'Assets', 'Client', fileName);
                                if (!fs.existsSync(filePath)) {
                                    // If not found in any of these locations, try to match partial names
                                    const manifestDir = pathModule.join(__dirname, '..', 'Manifests');
                                    const files = fs.readdirSync(manifestDir);
                                    for (const file of files) {
                                        if (file.toLowerCase().includes(fileName.toLowerCase())) {
                                            filePath = pathModule.join(manifestDir, file);
                                            break;
                                        }
                                    }

                                    if (!filePath) {
                                        // Check Assets directory
                                        const assetsDir = pathModule.join(__dirname, '..', 'Manifests', 'Assets');
                                        if (fs.existsSync(assetsDir)) {
                                            const assetFiles = fs.readdirSync(assetsDir);
                                            for (const file of assetFiles) {
                                                if (file.toLowerCase().includes(fileName.toLowerCase())) {
                                                    filePath = pathModule.join(assetsDir, file);
                                                    break;
                                                }
                                            }

                                            if (!filePath) {
                                                // Check Assets/Client directory
                                                const clientDir = pathModule.join(__dirname, '..', 'Manifests', 'Assets', 'Client');
                                                if (fs.existsSync(clientDir)) {
                                                    const clientFiles = fs.readdirSync(clientDir);
                                                    for (const file of clientFiles) {
                                                        if (file.toLowerCase().includes(fileName.toLowerCase())) {
                                                            filePath = pathModule.join(clientDir, file);
                                                            break;
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Check if the file exists in any of the checked locations
                        if (filePath && fs.existsSync(filePath)) {
                            const fileContent = fs.readFileSync(filePath, 'utf8');

                            const httpResponse = 'HTTP/1.1 200 OK\r\n' +
                                               'Content-Type: application/xml\r\n' +
                                               'Content-Length: ' + Buffer.byteLength(fileContent, 'utf8') + '\r\n' +
                                               'Connection: keep-alive\r\n' +
                                               '\r\n' +
                                               fileContent;

                            socket.write(httpResponse);
                            console.log(`Sent actual ${fileName} from ${filePath}`);
                            return;
                        } else {
                            console.log(`${fileName} not found in any manifest directories`);
                        }
                    } catch (error) {
                        console.error(`Error reading manifest file ${path}:`, error);
                    }
                }
            }

            // For other requests, send 404
            const httpResponse = 'HTTP/1.1 404 Not Found\r\n' +
                               'Content-Type: text/html\r\n' +
                               'Content-Length: 134\r\n' +
                               'Connection: keep-alive\r\n' +
                               '\r\n' +
                               '<html><body>404 - Resource not found. This is a SmartFoxServer port. Available: /clientbin/data/AppManifest.xml</body></html>';

            socket.write(httpResponse);
            console.log('Sent HTTP response for manifest request');
            return;
        }

        // Handle different message types based on prefix
        if (message.startsWith('<')) {
            console.log('Processing as XML message');
            // XML message
            handleXmlMessage(socket, message.trim()); // Use trim() for XML messages
        } else if (message.startsWith('{')) {
            console.log('Processing as JSON message');
            // JSON message
            handleJsonMessage(socket, message.trim());
        } else if (message.startsWith('%')) {
            console.log('Processing as String message');
            // String message
            handleStringMessage(socket, message.trim());
        } else {
            console.log('Unknown message type received');
            console.log('Raw message:', message.substring(0, 500));
        }
    });

    // Add connection debugging
    socket.on('connect', () => {
        console.log(`SFS socket connected from ${socket.remoteAddress}:${socket.remotePort}`);
    });

    socket.on('ready', () => {
        console.log(`SFS socket ready from ${socket.remoteAddress}:${socket.remotePort}`);
    });


    // When a client connects to the SFS server, we need to handle the connection sequence properly
    // The client will send a verChk message first, which we handle in the XML message handler
    // We should NOT send any response immediately upon connection
    // The responses will be sent when the client sends specific messages
    console.log(`SFS socket connection established for ${socket.remoteAddress}:${socket.remotePort}`);

    // Debugging: Log when connection is established
    console.log(`DEBUG: SmartFoxServer connection established from ${socket.remoteAddress}:${socket.remotePort}`);
    console.log(`DEBUG: Waiting for verChk message from client...`);

    
    socket.on('close', () => {
        console.log(`=== SOCKET CONNECTION CLOSED ===`);
        console.log(`Connection closed for ${socket.userName || socket.id} (ID: ${socket.id})`);
        console.log(`Socket state at close - loggedIn: ${socket.loggedIn}, userId: ${socket.userId}, activeRoomId: ${socket.activeRoomId}`);

        if (socket.userId && users[socket.userId]) {
            users[socket.userId].online = false;

            // Save user data when they disconnect
            saveUserData(socket.userId);
        }

        // Remove user from any rooms they were in
        if (socket.activeRoomId !== -1) {
            for (const roomId in gameRooms) {
                const room = gameRooms[roomId];
                if (room.id === socket.activeRoomId) {
                    console.log(`Removing user ${socket.userId} from room ${socket.activeRoomId}`);
                    // Remove user from room
                    room.users = room.users.filter(user => user.id !== socket.userId);
                    // Decrease user count
                    if (room.userCount > 0) room.userCount--;
                    break;
                }
            }
        }
        socket.activeRoomId = -1;

        // Remove user from any battles they were in
        if (socket.activeBattle) {
            const battle = battleRooms[socket.activeBattle];
            if (battle) {
                // Remove player from battle
                battle.players = battle.players.filter(p => p.id !== socket.userId);

                // If there's only one player left, end the game
                if (battle.players.length <= 1) {
                    battle.gameState = 'finished';

                    // Notify remaining players that the game is over
                    for (const player of battle.players) {
                        const gameOverMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameOver","winnerId":"${battle.players[0]?.id || ''}","results":"Game ended due to player disconnect"}]]></body></msg>\x00`;

                        // In a real implementation, we would send this to each player's socket
                        // For now, we'll just log it
                        console.log(`Game over message for remaining player: ${player.name}`);
                    }
                }

                // Clean up the battle if it's empty
                if (battle.players.length === 0) {
                    delete battleRooms[socket.activeBattle];
                }
            }
        }
        socket.activeBattle = null;

        // Remove socket from the global socket map
        if (socket.userId) {
            delete socketMap[socket.userId];
        }
        console.log(`=== SOCKET CONNECTION CLOSED COMPLETE ===`);
    });
    
    socket.on('error', (err) => {
        console.error('=== SOCKET ERROR ===');
        console.error(`Socket error for ${socket.userName || socket.id} (ID: ${socket.id}):`, err);
        console.error(`Socket state at error - loggedIn: ${socket.loggedIn}, userId: ${socket.userId}, activeRoomId: ${socket.activeRoomId}`);
        console.error('==================');
    });
  });
}

module.exports = { createSfsServer, sfsPort };
