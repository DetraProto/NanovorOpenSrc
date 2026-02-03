const state = require('../../state');
const user = require('../../user');
const handleGameXtCommand = require('./gameXt');
const { users } = state;
const { saveUserData } = user;

function handleExtensionCommand(socket, extension, command, params) {
    console.log(`Handling extension command: ${extension}.${command}`);
    
    let response = '';
    
    switch (extension) {
        case 'loginXt':
            switch (command) {
                case 'updateUserToken':
                    // Update user token
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"userTokenUpdated"}]]></body></msg>\x00`;
                    break;
                case 'updateAvatar':
                    // Update avatar
                    const newAvatarId = params.avatarId || 1;
                    if (users[socket.userId]) {
                        users[socket.userId].avatarId = parseInt(newAvatarId);

                        // Save user data after updating avatar
                        saveUserData(socket.userId);
                    }
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"avatarUpdated"}]]></body></msg>\x00`;
                    break;
                case 'getBuddyAvatar':
                    // Return user's avatar info
                    const user = users[socket.userId] || {};
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"buddyAvatarData","avatarId":${user.avatarId || 1},"nmp":${user.nmp || 0}}]]></body></msg>\x00`;
                    break;
                case 'getUserData':
                case 'syncUserData':
                    // Return comprehensive user data (includes nanocash for sync)
                    const userData = users[socket.userId] || {};
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"userDataSynced","username":"${socket.userName || 'n'}","avatarId":${userData.avatarId || 1},"nmp":${userData.nmp || 0},"nanocash":${userData.nanocash || 0},"gamesPlayed":${userData.gamesPlayed || 0},"hasSeenNewUserExperience":${userData.hasSeenNewUserExperience || false}}]]></body></msg>\x00`;
                    break;
                case 'updateNanovorCount':
                    // Update nanovor count
                    if (params.nanovorCount !== undefined && users[socket.userId]) {
                        users[socket.userId].nanovorCount = parseInt(params.nanovorCount) || 0;

                        // Save user data after updating nanovor count
                        saveUserData(socket.userId);
                    }
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"nanovorCountUpdated"}]]></body></msg>\x00`;
                    break;

                case 'addNanovor':
                    // Add a nanovor to the user's inventory
                    if (params.nanovorData && users[socket.userId]) {
                        const nanovorData = params.nanovorData;

                        // Ensure nanovorInventory exists
                        if (!users[socket.userId].nanovorInventory) {
                            users[socket.userId].nanovorInventory = [];
                        }

                        // Add the new nanovor to inventory
                        users[socket.userId].nanovorInventory.push(nanovorData);

                        // Update counts
                        users[socket.userId].nanovorCount = users[socket.userId].nanovorInventory.length;
                        users[socket.userId].nanovorCountUnique = users[socket.userId].nanovorInventory.length; // Simplified for now

                        // Save user data after updating inventory
                        saveUserData(socket.userId);
                    }
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"nanovorAdded"}]]></body></msg>\x00`;
                    break;

                case 'removeNanovor':
                    // Remove a nanovor from the user's inventory
                    if (params.nanovorId !== undefined && users[socket.userId]) {
                        const removeNanovorId = parseInt(params.nanovorId);

                        if (users[socket.userId].nanovorInventory) {
                            // Filter out the nanovor with the specified ID
                            users[socket.userId].nanovorInventory = users[socket.userId].nanovorInventory.filter(nanovor => nanovor.id !== removeNanovorId);

                            // Update counts
                            users[socket.userId].nanovorCount = users[socket.userId].nanovorInventory.length;
                            users[socket.userId].nanovorCountUnique = users[socket.userId].nanovorInventory.length; // Simplified for now

                            // Save user data after updating inventory
                            saveUserData(socket.userId);
                        }
                    }
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"nanovorRemoved"}]]></body></msg>\x00`;
                    break;

                case 'addEm':
                    // Add an Energy Matrix to the user's inventory
                    if (params.emData && users[socket.userId]) {
                        const emData = params.emData;

                        // Ensure emInventory exists
                        if (!users[socket.userId].emInventory) {
                            users[socket.userId].emInventory = [];
                        }

                        // Add the new EM to inventory
                        users[socket.userId].emInventory.push(emData);

                        // Update EM count
                        users[socket.userId].ems = users[socket.userId].emInventory.length;

                        // Save user data after updating inventory
                        saveUserData(socket.userId);
                    }
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"emAdded"}]]></body></msg>\x00`;
                    break;

                case 'removeEm':
                    // Remove an Energy Matrix from the user's inventory
                    if (params.emId !== undefined && users[socket.userId]) {
                        const emId = parseInt(params.emId);

                        if (users[socket.userId].emInventory) {
                            // Filter out the EM with the specified ID
                            users[socket.userId].emInventory = users[socket.userId].emInventory.filter(em => em.id !== emId);

                            // Update EM count
                            users[socket.userId].ems = users[socket.userId].emInventory.length;

                            // Save user data after updating inventory
                            saveUserData(socket.userId);
                        }
                    }
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"emRemoved"}]]></body></msg>\x00`;
                    break;
                case 'initialize':  // Likely initial command sent by client to loginXt extension
                case 'login':       // Another possibility for initial login command to extension
                case 'init':        // Another possible initialization command
                    // Send logOK as response to initial extension request
                    // For new users, ensure nmp and gamesPlayed are 0 to trigger NewUserState
                    const userData1 = users[socket.userId] || {};
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"logOK","username":"${socket.userName || 'n'}","chatRoomName":"Lobby","avatarId":${userData1.avatarId || 1},"nmp":${userData1.nmp || 0},"gamesPlayed":${userData1.gamesPlayed || 0}}]]></body></msg>\x00`;
                    break;
                default:
                    // For unknown commands, return unknown command response
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"unknownCommand"}]]></body></msg>\x00`;
                    break;
            }
            break;
            
        case 'chatXt':
            switch (command) {
                case 'getChatRoomList':
                    // Return available chat rooms
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"chatRoomListResponse","rooms":[{"id":1,"name":"General","userCount":5}]}]]></body></msg>\x00`;
                    break;
                default:
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"unknownCommand"}]]></body></msg>\x00`;
            }
            break;
            
        case 'tradeXt':
            switch (command) {
                case 'getBadgeList':
                    // Return empty badge list for trade
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"tradeBadgeList","badges":[]}]]></body></msg>\x00`;
                    break;
                default:
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"unknownCommand"}]]></body></msg>\x00`;
            }
            break;
            
        case 'buddyListXt':
            switch (command) {
                case 'getBuddyList':
                    // Return empty buddy list
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"buddyListLoaded","buddies":[]}]]></body></msg>\x00`;
                    break;
                default:
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"unknownCommand"}]]></body></msg>\x00`;
            }
            break;

        case 'gameXt':
            // Handle battle-related commands
            handleGameXtCommand(socket, command, params);
            return; // Return early since response is handled in the function

        default:
            response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"unknownExtension"}]]></body></msg>\x00`;
    }

    socket.write(response);
}

// Load existing user data at startup

module.exports = handleExtensionCommand;
