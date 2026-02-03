const { parseString } = require('xml2js');
const state = require('../../state');
const user = require('../../user');
const handleExtensionCommand = require('./extension');
const { users, gameRooms, socketMap } = state;
const { findSessionByToken, createUserProfile, saveUserData, loadUserData } = user;

function handleXmlMessage(socket, message) {
    // Add debugging to see incoming XML messages
    console.log(`DEBUG: Received XML message from client: ${message.substring(0, 200)}...`);

    // Parse the XML message
    parseString(message, (err, result) => {
        if (err) {
            console.error('Error parsing XML:', err);
            console.log('Raw message:', message);
            return;
        }

        console.log(`DEBUG: Parsed XML result keys:`, Object.keys(result || {}));

        // Safely extract the action from the XML
        let action = null;
        let body = null;
        let msg = null;

        try {
            msg = result.msg;
            console.log(`DEBUG: XML message structure - msg exists: ${!!msg}, body exists: ${!!(msg && msg.body)}, body length: ${(msg && msg.body) ? msg.body.length : 0}`);

            if (!msg || !msg.body || !msg.body[0]) {
                console.error('Invalid XML structure - missing msg.body[0]:', result);
                return;
            }

            body = msg.body[0];

            // Check if body has attributes (accessed via $ in xml2js)
            if (body.$ && body.$.action) {
                action = body.$.action;
            } else {
                // Some actions might be stored differently in the parsed XML
                // Check for other possible locations of the action
                if (body['@'] && body['@'].action) {
                    action = body['@'].action;
                } else if (msg.body[0]['@action']) {
                    action = msg.body[0]['@action'];
                }
            }
        } catch (parseErr) {
            console.error('Error extracting action from XML:', parseErr);
            console.log('Full XML message:', message);
            console.log('Parsed result:', result);
            return;
        }

        console.log(`Processing XML action: ${action}`);
        console.log(`Full XML message: ${message}`);

        switch (action) {
            case 'verChk':
                // Version check - respond with version compatibility check
                // The client expects a verChk response to confirm version compatibility
                console.log('DEBUG: Processing verChk request from client');
                const verResponse = '<msg t="sys"><body action="verChk" r="0"><result v="156"/></body></msg>\x00';
                console.log('Sending verChk response:', verResponse.replace(/\x00/g, '\\x00'));
                socket.write(verResponse);

                // After version check, send apiOK to indicate connection is established
                const apiOKResponse = '<msg t="sys"><body action="apiOK" r="0"></body></msg>\x00';
                console.log('Sending apiOK response:', apiOKResponse.replace(/\x00/g, '\\x00'));
                socket.write(apiOKResponse);

                console.log('Sent version check response (verChk) and apiOK');
                break;

            case 'login':
                // Handle login
                console.log('DEBUG: Processing login request from client');
                const zone = msg.$.z;
                const username = body.login && body.login[0] && body.login[0].nick && body.login[0].nick[0] && body.login[0].nick[0]._
                    ? body.login[0].nick[0]._
                    : (body.nick ? body.nick[0]._ : null);
                const password = body.login && body.login[0] && body.login[0].pword && body.login[0].pword[0] && body.login[0].pword[0]._
                    ? body.login[0].pword[0]._
                    : (body.pword ? body.pword[0]._ : null);

                console.log(`Login attempt - zone: ${zone}, username: ${username}, password length: ${password ? password.length : 'null'}`);

                // Validate the login token
                const session = findSessionByToken(password);
                if (session) {
                    console.log(`DEBUG: Valid session found for token, accountId: ${session.accountId}`);

                    // Successful login
                    socket.loggedIn = true;
                    socket.userId = session.accountId;
                    socket.userName = username;

                    // Register socket in the global socket map
                    socketMap[session.accountId] = socket;

                    // Update user status
                    if (users[session.accountId]) {
                        users[session.accountId].online = true;
                        users[session.accountId].lastLogin = new Date();

                        // Save user data after updating status
                        saveUserData(session.accountId);
                    } else {
                        // If user doesn't exist in memory, try to load from file
                        const existingUser = loadUserData(session.accountId);
                        if (!existingUser) {
                            // User doesn't exist in file either, create a new profile
                            users[session.accountId] = createUserProfile(session.accountId, username);

                            // Save the new user data to file
                            saveUserData(session.accountId);
                        } else {
                            // User was loaded from file, just update online status
                            users[session.accountId].online = true;
                            users[session.accountId].lastLogin = new Date();

                            // Save user data after updating status
                            saveUserData(session.accountId);
                        }
                    }

                    // Ensure the user profile exists in the users object
                    if (!users[session.accountId]) {
                        // This shouldn't happen if the above logic is correct, but as a fallback:
                        users[session.accountId] = createUserProfile(session.accountId, username);
                        saveUserData(session.accountId);
                    }

                    // Send system login response first (this follows the expected SFS protocol)
                    const sysLoginResponse = `<msg t="sys"><body action="logOK" r="0"><login id="${session.accountId}" mod="0" n="${username}"/></body></msg>\x00`;
                    console.log('Sending system login response:', sysLoginResponse.replace(/\x00/g, '\\x00'));
                    socket.write(sysLoginResponse);

                    // Add a small delay before sending the extension response to ensure proper sequencing
                    setTimeout(() => {
                        // After successful system login, send the logOK message from the loginXt extension
                        // This is what the client expects to receive to finalize the login process
                        const user = users[socket.userId] || {}; // Use socket.userId instead of session.accountId to ensure consistency
                        const loginOkResponse = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"logOK","username":"${socket.userName}","chatRoomName":"Lobby","avatarId":${user.avatarId || 1},"nmp":${user.nmp || 0}}]]></body></msg>\x00`;
                        console.log('Sending extension login response:', loginOkResponse.replace(/\x00/g, '\\x00'));
                        socket.write(loginOkResponse);

                        console.log(`User ${socket.userName} (${socket.userId}) logged in successfully at system level and extension level`);
                    }, 100); // Small delay to ensure proper message sequencing
                } else {
                    console.log(`DEBUG: No valid session found for token: ${password ? password.substring(0, 10) + '...' : 'null'}`);

                    // Login failed - send system error response
                    const sysLoginFailure = `<msg t="sys"><body action="logKO" r="0"><login e="Invalid login token"/></body></msg>\x00`; // Standard SFS error code
                    socket.write(sysLoginFailure);

                    console.log(`Login failed for user ${username} with token ${password ? password.substring(0, 10) + '...' : 'null'}`);
                }
                break;

            case 'autoJoin':
                // Auto join lobby room
                if (socket.loggedIn) {
                    // Create or get lobby room
                    if (!gameRooms['lobby']) {
                        gameRooms['lobby'] = {
                            id: 1,
                            name: 'Lobby',
                            maxUsers: 100,
                            maxSpectators: 100,
                            isTemp: false,
                            isGame: false,
                            isPrivate: false,
                            limbo: false,
                            userCount: 0,
                            spectatorCount: 0,
                            users: [],
                            variables: {}
                        };
                    }

                    // Add user to room
                    gameRooms['lobby'].users.push({
                        id: socket.userId,
                        name: socket.userName
                    });

                    // Update room user count
                    gameRooms['lobby'].userCount++;

                    // Set active room ID
                    socket.activeRoomId = 1;

                    // Send join room response with proper format that client expects
                    // The client's handleJoinOk function expects specific elements in the body
                    // Include user variables that the client expects
                    const user = users[socket.userId] || {};
                    const userVars = `<vars><var n="avatarId" t="n"><![CDATA[${user.avatarId || 1}]]></var><var n="nmp" t="n"><![CDATA[${user.nmp || 0}]]></var><var n="gamesPlayed" t="n"><![CDATA[${user.gamesPlayed || 0}]]></var></vars>`;
                    const joinResponse = `<msg t="sys"><body action="joinOK" r="1"><joined roomId="1" roomName="Lobby"/><uLs><u i="${socket.userId}" n="${socket.userName}" m="0" s="0">${userVars}</u></uLs><pid id="1"/></body></msg>\x00`;
                    console.log('Sending join room response:', joinResponse.replace(/\x00/g, '\\x00'));
                    socket.write(joinResponse);

                    console.log(`User ${socket.userName} auto-joined lobby room`);
                } else {
                    // If not logged in, send error
                    const joinError = `<msg t="sys"><body action="joinKO" r="1"><error msg="Not logged in"/></body></msg>\x00`;
                    socket.write(joinError);
                }
                break;

            case 'getRmList':
                // Send room list to the client
                if (socket.loggedIn) {
                    // Create default rooms if they don't exist
                    if (!gameRooms['lobby']) {
                        gameRooms['lobby'] = {
                            id: 1,
                            name: 'Lobby',
                            maxUsers: 100,
                            maxSpectators: 100,
                            isTemp: false,
                            isGame: false,
                            isPrivate: false,
                            limbo: false,
                            userCount: 0,
                            spectatorCount: 0,
                            users: [],
                            variables: {} // Room variables
                        };
                    }

                    // Ensure battle room exists
                    if (!gameRooms['battle']) {
                        gameRooms['battle'] = {
                            id: 2,
                            name: 'Battle Arena',
                            maxUsers: 4,
                            maxSpectators: 10,
                            isTemp: false,
                            isGame: true,
                            isPrivate: false,
                            limbo: false,
                            userCount: 0,
                            spectatorCount: 0,
                            users: [],
                            variables: {} // Room variables
                        };
                    }

                    // Build XML response for room list
                    let roomListXml = '<rmList>';
                    for (const roomId in gameRooms) {
                        const room = gameRooms[roomId];
                        let varsXml = '<vars>';
                        for (const varName in room.variables) {
                            const value = room.variables[varName];
                            const type = typeof value === 'boolean' ? 'b' : typeof value === 'number' ? 'n' : 's';
                            const strValue = value ? value.toString() : '';
                            varsXml += `<var n="${varName}" t="${type}"><![CDATA[${strValue}]]></var>`;
                        }
                        varsXml += '</vars>';

                        roomListXml += `<rm id="${room.id}" maxu="${room.maxUsers}" maxs="${room.maxSpectators}" ` +
                                      `temp="${room.isTemp ? '1' : '0'}" game="${room.isGame ? '1' : '0'}" ` +
                                      `priv="${room.isPrivate ? '1' : '0'}" lmb="${room.limbo ? '1' : '0'}" ` +
                                      `ucnt="${room.userCount}" scnt="${room.spectatorCount}">` +
                                      `<n><![CDATA[${room.name}]]></n>` +
                                      `<pwd></pwd>` +
                                      `<max>${room.maxUsers}</max>` +
                                      `${varsXml}` +
                                      `</rm>`;
                    }
                    roomListXml += '</rmList>';

                    const roomListResponse = `<msg t="sys"><body action="rmList" r="${socket.activeRoomId || -1}">${roomListXml}</body></msg>\x00`;
                    socket.write(roomListResponse);

                    console.log(`Sent room list to user ${socket.userName}`);
                } else {
                    // If not logged in, send error
                    const roomListError = `<msg t="sys"><body action="rmList" r="-1"><error msg="Not logged in"/></body></msg>\x00`;
                    socket.write(roomListError);
                }
                break;

            case 'setUvars':
                // Set user variables
                if (socket.loggedIn && body && body['@r']) {
                    // Parse variables from the XML
                    const user = users[socket.userId];
                    if (user) {
                        // In a real implementation, we would parse the XML properly
                        // For now, just acknowledge the request
                        console.log(`User ${socket.userName} updated user variables`);
                    }

                    // Send confirmation - get room ID from the body attributes
                    const roomId = body['@r'] ? parseInt(body['@r']) : socket.activeRoomId;
                    const setUserVarsResponse = `<msg t="sys"><body action="uVarsUpdate" r="${roomId}"><![CDATA[]]></body></msg>\x00`;
                    socket.write(setUserVarsResponse);
                }
                break;

            case 'setRvars':
                // Set room variables
                if (socket.loggedIn && body && body['@r']) {
                    const roomId = parseInt(body['@r']);
                    const room = gameRooms[roomId];
                    if (room) {
                        // In a real implementation, we would parse the room variables
                        // For now, just acknowledge the request
                        console.log(`User ${socket.userName} updated room ${roomId} variables`);
                    }

                    // Send confirmation
                    const setRoomVarsResponse = `<msg t="sys"><body action="rVarsUpdate" r="${roomId}"><![CDATA[]]></body></msg>\x00`;
                    socket.write(setRoomVarsResponse);
                }
                break;

            case 'logout':
                // Handle logout
                console.log(`Logout request for user: ${socket.userName || socket.id}`);

                // Update user status
                if (socket.userId && users[socket.userId]) {
                    users[socket.userId].online = false;

                    // Save user data before logging out
                    saveUserData(socket.userId);
                }

                // Remove socket from the global socket map
                if (socket.userId) {
                    delete socketMap[socket.userId];
                }

                socket.loggedIn = false;
                socket.userId = null;
                socket.userName = null;
                socket.activeRoomId = -1;

                // Send logout confirmation
                const logoutResponse = `<msg t="sys"><body action="logout" r="-1"><![CDATA[{}]]></body></msg>\x00`;
                socket.write(logoutResponse);
                break;

            default:
                console.log(`Unhandled XML action: ${action}`);
                console.log('Available actions in body:', Object.keys(body || {}).filter(key => key !== '$'));
                break;
        }
    });
}

module.exports = handleXmlMessage;
