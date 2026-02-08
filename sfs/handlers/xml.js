const { parseString } = require('xml2js');
const state = require('../../state');
const user = require('../../user');
const handleExtensionCommand = require('./extension');
const gameRoomsModule = require('../../gameRooms');
const { users, gameRooms, socketMap } = state;
const { findSessionByToken, createUserProfile, saveUserData, loadUserData } = user;
const { getAllRooms } = gameRoomsModule;

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
                // Zone is an attribute of the login element, not the msg element
                const zone = body.login && body.login[0] && body.login[0].$ ? body.login[0].$.z : undefined;

                // Parse username from either the nested login structure or direct nick
                let username = null;
                if (body.login && body.login[0] && body.login[0].nick) {
                    // Handle CDATA format: body.login[0].nick[0] contains the username
                    if (Array.isArray(body.login[0].nick) && body.login[0].nick[0]) {
                        username = body.login[0].nick[0];
                    }
                } else if (body.nick && body.nick[0]) {
                    username = body.nick[0];
                }

                // Parse password from either the nested login structure or direct pword
                let password = null;
                if (body.login && body.login[0] && body.login[0].pword) {
                    // Handle CDATA format: body.login[0].pword[0] contains the password/token
                    if (Array.isArray(body.login[0].pword) && body.login[0].pword[0]) {
                        password = body.login[0].pword[0];
                    }
                } else if (body.pword && body.pword[0]) {
                    password = body.pword[0];
                }

                console.log(`Login attempt - zone: ${zone}, username: ${username}, password length: ${password ? password.length : 'null'}`);

                // Validate the login token
                const session = findSessionByToken(password);
                if (session) {
                    console.log(`DEBUG: Valid session found for token, accountId: ${session.accountId}`);

                    // Successful login
                    socket.loggedIn = true;
                    socket.userId = session.accountId;
                    // Use the username from the session data instead of the client-provided placeholder 'n'
                    // The session should contain the actual username from the SRB authentication
                    socket.userName = session.username || username || 'n';
                    socket.playerId = session.accountId;

                    // Register socket in the global socket map
                    socketMap[session.accountId] = socket;

                    // Update user status
                    if (users[session.accountId]) {
                        users[session.accountId].online = true;
                        users[session.accountId].lastLogin = new Date();

                        // Notify user's buddies that they came online
                        if (users[session.accountId].buddyList && Array.isArray(users[session.accountId].buddyList)) {
                            for (const buddy of users[session.accountId].buddyList) {
                                const buddyData = users[parseInt(buddy.userRefId)];
                                if (buddyData && buddyData.online) {
                                    // Find the buddy's socket to send status update
                                    const buddySocket = socketMap[parseInt(buddy.userRefId)];
                                    if (buddySocket) {
                                        // Send status update to buddy
                                        const statusUpdate = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"buddyStatusChanged","username":"${username}","userRefId":"${session.accountId}","status":"online","avatarId":${users[session.accountId].avatarId || 1},"nmp":${users[session.accountId].nmp || 0}}]]></body></msg>\x00`;
                                        buddySocket.write(statusUpdate);
                                    }
                                }
                            }
                        }

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

                            // Notify user's buddies that they came online
                            if (users[session.accountId].buddyList && Array.isArray(users[session.accountId].buddyList)) {
                                for (const buddy of users[session.accountId].buddyList) {
                                    const buddyData = users[parseInt(buddy.userRefId)];
                                    if (buddyData && buddyData.online) {
                                        // Find the buddy's socket to send status update
                                        const buddySocket = socketMap[parseInt(buddy.userRefId)];
                                        if (buddySocket) {
                                            // Send status update to buddy
                                            const statusUpdate = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"buddyStatusChanged","username":"${username}","userRefId":"${session.accountId}","status":"online","avatarId":${users[session.accountId].avatarId || 1},"nmp":${users[session.accountId].nmp || 0}}]]></body></msg>\x00`;
                                            buddySocket.write(statusUpdate);
                                        }
                                    }
                                }
                            }

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

                    // Set the user's active room to the lobby after successful login
                    const lobbyRoom = gameRooms['lobby'];
                    if (lobbyRoom) {
                        socket.activeRoomId = lobbyRoom.id; // Should be 1
                    } else {
                        socket.activeRoomId = -1; // Default if lobby doesn't exist
                    }

                    const sysLoginResponse = `<msg t="sys"><body action="logOK" r="0"><login id="${socket.playerId}" mod="0" n="${username}"/></body></msg>\x00`;
                    console.log('Sending system login response:', sysLoginResponse.replace(/\x00/g, '\\x00'));
                    socket.write(sysLoginResponse);

                    // Send extension login response after a short delay to allow client to initialize
                    setTimeout(() => {
                        if (socket.loggedIn) {
                            const escapedUsername = (socket.userName || 'n').toString().replace(/[&<>"']/g, function(match) {
                                return {
                                    '&': '&amp;',
                                    '<': '&lt;',
                                    '>': '&gt;',
                                    '"': '&quot;',
                                    "'": '&apos;'
                                }[match];
                            });
                            // Send JSON format extension response as expected by the client
                            // The client expects JSON format: {"t":"xt", "b": {"action":"xtRes", "r":-1, "o": {...}}}
                            // Include chatRoomName field which is expected by SmartFoxChatGameService
                            const loginOkResponse = `{"t":"xt","b":{"action":"xtRes","r":-1,"o":{"_cmd":"logOK","chatRoomName":"Lobby","username":"${escapedUsername}","userRefId":"${socket.playerId}"}}}\x00`;
                            console.log('Sending delayed extension login response (JSON format):', loginOkResponse.replace(/\x00/g, '\\x00'));
                            console.log('\x1b[31m%s\x1b[0m', '[EXT_DEBUG] Sending extension response with _cmd: logOK after login (JSON format)');
                            socket.write(loginOkResponse);
                        }
                    }, 100); // Small delay to ensure proper sequencing


                    console.log(`User ${socket.userName} (${socket.userId}) logged in successfully at system level and extension level`);

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
                    // Get lobby room (should already exist from state initialization)
                    const lobbyRoom = gameRooms['lobby'];

                    if (!lobbyRoom) {
                        console.error('Lobby room does not exist!');
                        const joinError = `<msg t="sys"><body action="joinKO" r="1"><error msg="Lobby room not found"/></body></msg>\x00`;
                        socket.write(joinError);
                        return;
                    }

                    // Add user to room if not already in it
                    const userAlreadyInRoom = lobbyRoom.users.some(user => user.id === socket.userId);
                    if (!userAlreadyInRoom) {
                        lobbyRoom.users.push({
                            id: socket.userId,
                            name: socket.userName
                        });

                        // Update room user count
                        lobbyRoom.userCount++;
                    }

                    // Set active room ID
                    socket.activeRoomId = lobbyRoom.id;

                    // Send join room response with proper format that client expects
                    // The client's handleJoinOk function expects specific elements in the body
                    // Include user variables that the client expects
                    const user = users[socket.userId] || {};
                    const userVars = `<vars><var n="avatarId" t="n"><![CDATA[${user.avatarId || 1}]]></var><var n="nmp" t="n"><![CDATA[${user.nmp || 0}]]></var><var n="gamesPlayed" t="n"><![CDATA[${user.gamesPlayed || 0}]]></var></vars>`;
                    // Include the player ID attribute (p) as expected by the client's handleJoinOk function
                    const joinResponse = `<msg t="sys"><body action="joinOK" r="${lobbyRoom.id}"><joined roomId="${lobbyRoom.id}" roomName="${lobbyRoom.name}"/><uLs><u i="${socket.userId}" n="${socket.userName}" m="0" s="0" p="${socket.playerId || 1}">${userVars}</u></uLs><pid id="${socket.playerId || 1}"/></body></msg>\x00`;
                    console.log('Sending join room response:', joinResponse.replace(/\x00/g, '\\x00'));
                    socket.write(joinResponse);

                    console.log(`User ${socket.userName} auto-joined lobby room`);

                    // Also auto-join the user to the corresponding chat room (Lobby chat)
                    // This is needed so the user can send chat messages immediately after login
                    // Import the chatXt handler to properly add the user to the chat room
                    try {
                        const chatState = require('../../state');
                        // Add the user to the lobby chat room directly in the server's chat room data
                        // The chat rooms are managed separately from game rooms
                        if (!global.chatRooms) {
                            // Initialize chat rooms if they don't exist
                            global.chatRooms = {
                                'General': {
                                    name: 'General',
                                    id: '-1',
                                    userCount: 0,
                                    users: [],
                                    maxUsers: 50,
                                    isPrivate: false
                                },
                                'Lobby': {
                                    name: 'Lobby',
                                    id: '1',
                                    userCount: 0,
                                    users: [],
                                    maxUsers: 100,
                                    isPrivate: false
                                }
                            };
                        }

                        const lobbyChatRoom = global.chatRooms['Lobby'];
                        if (lobbyChatRoom) {
                            // Check if user is already in the chat room
                            const userAlreadyInChatRoom = lobbyChatRoom.users.some(user => user.id === socket.userId);
                            if (!userAlreadyInChatRoom) {
                                // Add user to the chat room
                                const userObj = {
                                    id: socket.userId,
                                    name: socket.userName,
                                    avatarId: users[socket.userId]?.avatarId || 1,
                                    nmp: users[socket.userId]?.nmp || 0
                                };

                                lobbyChatRoom.users.push(userObj);
                                lobbyChatRoom.userCount = lobbyChatRoom.users.length;

                                console.log(`User ${socket.userName} also auto-added to lobby chat room`);
                            } else {
                                console.log(`User ${socket.userName} was already in lobby chat room`);
                            }
                        }
                    } catch (error) {
                        console.error('Error auto-adding user to chat room:', error);
                    }
                } else {
                    // If not logged in, send error
                    const joinError = `<msg t="sys"><body action="joinKO" r="1"><error msg="Not logged in"/></body></msg>\x00`;
                    socket.write(joinError);
                }
                break;

            case 'getRmList':
                // Send room list to the client with exact format expected by client
                if (socket.loggedIn) {
                    // Get all rooms by ID for proper client compatibility
                    const allRooms = getAllRooms(); // This gets rooms indexed by ID

                    // Build the room list XML with exact format expected by client
                    let roomListXml = '<rmList>';

                    // Check if there are any rooms to send
                    const roomIds = Object.keys(allRooms);

                    if (roomIds.length === 0) {
                        // Even if no rooms exist, send an empty rmList element as expected by client
                        console.log('No rooms found, sending empty room list');
                    } else {
                        // Process all rooms with exact format expected by client
                        for (const roomId of roomIds) {
                            const room = allRooms[roomId];

                            // Ensure all numeric values are properly formatted as integers and are valid
                            const roomIdValue = parseInt(room.id) || -1;  // Default to 1 if invalid
                            const maxUsersValue = parseInt(room.maxUsers) || 100;  // Default to 100 if invalid
                            const maxSpectatorsValue = parseInt(room.maxSpectators) || 0;  // Default to 0 if invalid
                            const userCountValue = parseInt(room.userCount) || 0;  // Default to 0 if invalid
                            const spectatorCountValue = parseInt(room.spectatorCount) || 0;  // Default to 0 if invalid

                            // Validate that all required values are numbers to prevent client crashes
                            if (isNaN(roomIdValue) || isNaN(maxUsersValue) || isNaN(maxSpectatorsValue) ||
                                isNaN(userCountValue) || isNaN(spectatorCountValue)) {
                                console.error(`Invalid numeric value for room ${roomId}, skipping...`);
                                continue;
                            }

                            // Escape room name to ensure valid XML - ensure it's a string
                            let roomName = room.name;
                            if (roomName === null || roomName === undefined) {
                                roomName = 'Unnamed Room';
                            }
                            const escapedRoomName = roomName.toString().replace(/[&<>"']/g, function(match) {
                                return {
                                    '&': '&amp;',
                                    '<': '&lt;',
                                    '>': '&gt;',
                                    '"': '&quot;',
                                    "'": '&apos;'
                                }[match];
                            });

                            // Create variables XML with exact format expected by client
                            let varsXml = '<vars>';
                            if (room.variables && typeof room.variables === 'object') {
                                for (const varName in room.variables) {
                                    // Skip if varName is not a valid string
                                    if (typeof varName !== 'string' || !varName) continue;

                                    // Escape variable name to ensure valid XML
                                    const escapedVarName = varName.replace(/[&<>"']/g, function(match) {
                                        return {
                                            '&': '&amp;',
                                            '<': '&lt;',
                                            '>': '&gt;',
                                            '"': '&quot;',
                                            "'": '&apos;'
                                        }[match];
                                    });

                                    const value = room.variables[varName];

                                    // Determine type and format value for client compatibility
                                    let type, strValue;
                                    if (typeof value === 'boolean') {
                                        type = 'b';
                                        strValue = value ? '1' : '0'; // For boolean, use 1/0 as expected by client
                                    } else if (typeof value === 'number') {
                                        type = 'n';
                                        strValue = value.toString();
                                    } else {
                                        type = 's';
                                        strValue = (value !== null && value !== undefined) ? value.toString() : '';
                                    }

                                    // Escape variable value to ensure valid XML
                                    const escapedStrValue = strValue.replace(/[&<>"']/g, function(match) {
                                        return {
                                            '&': '&amp;',
                                            '<': '&lt;',
                                            '>': '&gt;',
                                            '"': '&quot;',
                                            "'": '&apos;'
                                        }[match];
                                    });

                                    // Add the variable to XML with exact format expected by client
                                    varsXml += `<var n="${escapedVarName}" t="${type}"><![CDATA[${escapedStrValue}]]></var>`;
                                }
                            }
                            varsXml += '</vars>';

                            // Construct the room XML element with ALL required attributes in exact order expected by client
                            const roomElement = `<rm id="${roomIdValue}" maxu="${maxUsersValue}" maxs="${maxSpectatorsValue}" ` +
                                              `temp="${room.isTemp ? '1' : '0'}" game="${room.isGame ? '1' : '0'}" ` +
                                              `priv="${room.isPrivate ? '1' : '0'}" lmb="${room.limbo ? '1' : '0'}" ` +
                                              `ucnt="${userCountValue}" scnt="${spectatorCountValue}">` +
                                              `<n><![CDATA[${escapedRoomName}]]></n>` +
                                              `${varsXml}` +
                                              `</rm>`;

                            roomListXml += roomElement;
                        }

                        console.log(`Processed ${roomIds.length} rooms for room list response`);
                    }
                    roomListXml += '</rmList>';

                    // Use the room ID from the request body to maintain consistency with client expectations
                    // The client sends the active room ID in the 'r' attribute of the request
                    const requestRoomId = (body.$ && body.$.r !== undefined) ? body.$.r : '-1';
                    
                    const roomListResponse = `<msg t="sys"><body action="rmList" r="${requestRoomId}">${roomListXml}</body></msg>\x00`;
                    socket.write(roomListResponse);

                    console.log(`Sent room list to user ${socket.userName}. Room count: ${roomIds.length}. Request r: ${requestRoomId}`);
                    // Log the actual XML being sent for debugging (first 500 chars)
                    console.log(`Room list XML (first 500 chars): ${roomListXml.substring(0, 500)}...`);
                } else {
                    // If not logged in, send error with exact format expected by client
                    const roomListError = `<msg t="sys"><body action="rmList" r="-1"><error msg="Not logged in"/></body></msg>\x00`;
                    socket.write(roomListError);
                    console.log(`Room list request denied - user not logged in`);
                }
                break;

            case 'xtReq':
                // Handle extension requests
                if (socket.loggedIn) {
                    console.log('\x1b[31m%s\x1b[0m', `[XTREQ_DEBUG] *** EXTENSION REQUEST RECEIVED *** - socket state: userId=${socket.userId}, userName=${socket.userName}, playerId=${socket.playerId}`);
                    try {
                        // Extract extension name, command, and parameters from the CDATA section
                        // The CDATA content is typically in the body's text content
                        let cdataContent = null;

                        // Different ways xml2js might store the CDATA content
                        if (body && body['#text']) {
                            if (Array.isArray(body['#text'])) {
                                cdataContent = body['#text'][0];
                            } else {
                                cdataContent = body['#text'];
                            }
                        } else if (body && body['_']) {
                            // Sometimes CDATA is stored in the '_' property
                            cdataContent = body['_'];
                        } else if (body && typeof body === 'object') {
                            // Look for the actual content in the object
                            const keys = Object.keys(body);
                            for (const key of keys) {
                                if (key !== '$' && key !== '@' && typeof body[key] === 'string') {
                                    cdataContent = body[key];
                                    break;
                                }
                            }
                        }

                        console.log('\x1b[31m%s\x1b[0m', `[XTREQ_DEBUG] Raw CDATA content:`, cdataContent);

                        if (cdataContent) {
                            console.log('Extension request CDATA content:', cdataContent);

                            // Parse the serialized object from the CDATA
                            const xtData = JSON.parse(cdataContent);

                            // Extract extension name, command, and parameters
                            // Standard SmartFoxServer extension format: {"x":"extName", "c":"command", "r":roomId, "p":params}
                            const extensionName = xtData.x || xtData.name; // Extension name might be in 'x' or 'name'
                            const command = xtData.c || xtData.cmd;       // Command might be in 'c' or 'cmd'
                            const params = xtData.p || xtData.param;     // Params might be in 'p' or 'param'

                            console.log(`Extension request: ${extensionName}.${command}`, params);

                            // Call the extension handler
                            handleExtensionCommand(socket, extensionName, command, params);
                        } else {
                            console.log('No CDATA content in xtReq');
                            console.log('Body structure:', JSON.stringify(body, null, 2));

                            // Send error response
                            const xtErrorResponse = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"extensionError","error":"No data provided"}]]></body></msg>\x00`;
                            socket.write(xtErrorResponse);
                        }
                    } catch (error) {
                        console.error('Error processing extension request:', error);
                        console.log('Raw body content:', JSON.stringify(body, null, 2));

                        // Send error response
                        const xtErrorResponse = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"extensionError","error":"Invalid extension request format"}]]></body></msg>\x00`;
                        socket.write(xtErrorResponse);
                    }
                } else {
                    console.log('Extension request received but user not logged in');
                    // Send error response
                    const xtErrorResponse = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"extensionError","error":"Not logged in"}]]></body></msg>\x00`;
                    socket.write(xtErrorResponse);
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

                // Remove user from any rooms they were in
                if (socket.activeRoomId !== -1) {
                    for (const roomName in gameRooms) {
                        const room = gameRooms[roomName];
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

                // Update user status
                if (socket.userId && users[socket.userId]) {
                    users[socket.userId].online = false;

                    // Notify user's buddies that they went offline
                    if (users[socket.userId].buddyList && Array.isArray(users[socket.userId].buddyList)) {
                        for (const buddy of users[socket.userId].buddyList) {
                            const buddyData = users[parseInt(buddy.userRefId)];
                            if (buddyData && buddyData.online) {
                                // Find the buddy's socket to send status update
                                const buddySocket = socketMap[parseInt(buddy.userRefId)];
                                if (buddySocket) {
                                    // Send status update to buddy
                                    const statusUpdate = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"buddyStatusChanged","username":"${users[socket.userId].username}","userRefId":"${socket.userId}","status":"offline","avatarId":${users[socket.userId].avatarId || 1},"nmp":${users[socket.userId].nmp || 0}}]]></body></msg>\x00`;
                                    buddySocket.write(statusUpdate);
                                }
                            }
                        }
                    }

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
