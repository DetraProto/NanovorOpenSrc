const state = require('../../state');
const debug = require('../../debug/Debug');
const { users, gameRooms, socketMap } = state;

// Chat room storage - separate from game rooms
const chatRooms = {
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

// Invitation tracking
const invitations = {};

// Helper function to send a response to a socket
function sendXtResponse(socket, cmd, data) {
    // Use JSON format as expected by the client for extension responses
    // Format: {"t":"xt", "b":{"action":"xtRes", "r":-1, "o":{...}}}
    const combinedData = {...data, "_cmd": cmd};
    const response = `{"t":"xt","b":{"action":"xtRes","r":-1,"o":${JSON.stringify(combinedData)}}}\x00`;
    socket.write(response);
}

// Helper function to broadcast to all users in a chat room
function broadcastToChatRoom(chatRoomName, cmd, data) {
    const chatRoom = chatRooms[chatRoomName];
    if (!chatRoom) {
        console.log(`Chat room ${chatRoomName} not found for broadcast`);
        return;
    }

    // Use JSON format as expected by the client for extension responses
    // Format: {"t":"xt", "b":{"action":"xtRes", "r":-1, "o":{...}}}
    const combinedData = {...data, "_cmd": cmd};
    const message = `{"t":"xt","b":{"action":"xtRes","r":-1,"o":${JSON.stringify(combinedData)}}}\x00`;

    for (const user of chatRoom.users) {
        const userSocket = socketMap[user.id];
        if (userSocket) {
            userSocket.write(message);
        }
    }
}

// Handler for getChatRoomList command
function handleGetChatRoomList(socket, params) {
    // Prepare room list data as expected by client
    const roomNames = [];
    const roomCounts = [];

    for (const roomName in chatRooms) {
        const room = chatRooms[roomName];
        roomNames.push(room.name);
        roomCounts.push(room.userCount);
    }

    // Send response as expected by client - strings for both parameters
    sendXtResponse(socket, 'chatRoomListResponse', {
        chatRoomList: roomNames.join(','),
        chatRoomCounts: roomCounts.join(',')
    });

    // After sending the room list, ensure the user is in a default room if not already in one
    // Check if user is currently in any chat room
    let userInAnyChatRoom = false;
    for (const roomName in chatRooms) {
        const room = chatRooms[roomName];
        if (room.users.some(user => user.id === socket.userId)) {
            userInAnyChatRoom = true;
            break;
        }
    }

    // If user is not in any chat room, join them to the default lobby
    if (!userInAnyChatRoom) {
        // Join user to the Lobby room by default
        const defaultRoomName = 'Lobby';
        handleJoinChatRoom(socket, { chatRoomName: defaultRoomName });
    } else {
        // If the user is already in a chat room, make sure the public chat room name is set appropriately
        // Find which room the user is in and if it's a public room, set it as the public chat room
        for (const roomName in chatRooms) {
            const room = chatRooms[roomName];
            if (room.users.some(user => user.id === socket.userId)) {
                if (roomName === 'Lobby' || roomName === 'General') {
                    // Send a command to set this as the public chat room
                    sendXtResponse(socket, 'setPublicChatRoomName', {
                        chatRoomName: roomName
                    });
                }
                break; // User can only be in one chat room at a time in this implementation
            }
        }
    }
}

// Handler for inviteToChat command
function handleInviteToChat(socket, params) {
    const { chatRoomName, inviteeName } = params;
    
    // Find the invitee by username
    let inviteeSocket = null;
    let inviteeUserId = null;
    
    for (const userId in users) {
        if (users[userId].username === inviteeName || users[userId].screenname === inviteeName) {
            inviteeSocket = socketMap[userId];
            inviteeUserId = userId;
            break;
        }
    }
    
    if (!inviteeSocket) {
        // User not found or not online
        sendXtResponse(socket, 'chatInvitationRejected', {
            reason: 'User not found or offline',
            inviteeName: inviteeName
        });
        return;
    }
    
    // Create invitation
    const invitationId = `${socket.userId}_${inviteeUserId}_${Date.now()}`;
    invitations[invitationId] = {
        inviterId: socket.userId,
        inviterName: socket.userName,
        inviterAvatarId: users[socket.userId]?.avatarId || 1,
        inviterNMP: users[socket.userId]?.nmp || 0,
        inviteeId: inviteeUserId,
        inviteeName: inviteeName,
        chatRoomName: chatRoomName,
        timestamp: Date.now()
    };
    
    // Send invitation request to invitee
    const invitationData = {
        chatRoomName: chatRoomName,
        inviterName: socket.userName,
        inviterAvatarId: users[socket.userId]?.avatarId || 1,
        inviterNMP: users[socket.userId]?.nmp || 0
    };
    
    // Manually construct the response to ensure _cmd is always present
    const invitationResponseData = {...invitationData, "_cmd": "chatInvitationRequest"};
    inviteeSocket.write(`<msg t="xt"><body action="xtRes" r="-1"><![CDATA[${JSON.stringify(invitationResponseData)}]]></body></msg>\x00`);
    
    // Respond to inviter with success
    sendXtResponse(socket, 'chatRoomCreated', {
        chatRoomName: chatRoomName
    });
}

// Handler for replyChatInvitation command
function handleReplyChatInvitation(socket, params) {
    const { chatRoomName, accepted } = params;
    
    if (accepted) {
        // User accepted the invitation, join the chat room
        handleJoinChatRoom(socket, { chatRoomName });
        
        // Notify the inviter that the invitation was accepted
        // Find the inviter and send notification
        for (const id in invitations) {
            const invitation = invitations[id];
            if (invitation.chatRoomName === chatRoomName &&
                (invitation.inviteeId === socket.userId || invitation.inviteeName === socket.userName)) {

                const inviterSocket = socketMap[invitation.inviterId];
                if (inviterSocket) {
                    // Manually construct the response to ensure _cmd is always present
                    const responseObj = {
                        "_cmd": "chatInvitationResponse",
                        "chatRoomName": chatRoomName,
                        "inviteeName": socket.userName,  // The person who accepted
                        "accept": true,  // Indicate acceptance
                        "inviteeAvatarId": users[socket.userId]?.avatarId || 1,
                        "inviteeNMP": users[socket.userId]?.nmp || 0
                    };
                    inviterSocket.write(`<msg t="xt"><body action="xtRes" r="-1"><![CDATA[${JSON.stringify(responseObj)}]]></body></msg>\x00`);
                }

                // Remove the invitation
                delete invitations[id];
                break;
            }
        }
    } else {
        // User declined the invitation
        // Find the inviter and notify them
        for (const id in invitations) {
            const invitation = invitations[id];
            if (invitation.chatRoomName === chatRoomName && 
                (invitation.inviteeId === socket.userId || invitation.inviteeName === socket.userName)) {
                
                const inviterSocket = socketMap[invitation.inviterId];
                if (inviterSocket) {
                    // Manually construct the response to ensure _cmd is always present
                    const responseObj = {
                        "_cmd": "chatInvitationResponse",
                        "chatRoomName": chatRoomName,
                        "inviteeName": socket.userName,
                        "accept": false  // Indicate rejection
                    };
                    inviterSocket.write(`<msg t="xt"><body action="xtRes" r="-1"><![CDATA[${JSON.stringify(responseObj)}]]></body></msg>\x00`);
                }
                
                // Remove the invitation
                delete invitations[id];
                break;
            }
        }
        
        // Send rejection response to the user who declined
        sendXtResponse(socket, 'chatInvitationRejected', {
            reason: 'Invitation declined',
            chatRoomName: chatRoomName
        });
    }
}

// Handler for joinChatRoom command
function handleJoinChatRoom(socket, params) {
    const { chatRoomName } = params;
    
    // Check if room exists, if not create it
    if (!chatRooms[chatRoomName]) {
        chatRooms[chatRoomName] = {
            name: chatRoomName,
            id: chatRoomName,
            userCount: 0,
            users: [],
            maxUsers: 50,
            isPrivate: false
        };
    }
    
    const chatRoom = chatRooms[chatRoomName];
    
    // Check if room is full
    if (chatRoom.users.length >= chatRoom.maxUsers) {
        sendXtResponse(socket, 'chatRoomFull', {
            reason: 'Room is full',
            chatRoomName: chatRoomName
        });
        return;
    }
    
    // Check if user is already in this room
    const userAlreadyInRoom = chatRoom.users.some(user => user.id === socket.userId);
    if (userAlreadyInRoom) {
        // User is already in the room, just send confirmation
        sendXtResponse(socket, 'chatInvitationJoined', {
            chatRoomName: chatRoomName
        });
        return;
    }
    
    // Add user to the chat room
    const userObj = {
        id: socket.userId,
        name: socket.userName,
        avatarId: users[socket.userId]?.avatarId || 1,
        nmp: users[socket.userId]?.nmp || 0
    };
    
    chatRoom.users.push(userObj);
    chatRoom.userCount = chatRoom.users.length;
    
    // Send success response to the joining user
    sendXtResponse(socket, 'chatInvitationJoined', {
        chatRoomName: chatRoomName
    });

    // The client will receive the updated member list separately, no need to broadcast join event
    // The member list is already sent to the joining user above

    // Send the current member list to the joining user
    const memberNames = chatRoom.users.map(user => user.name).join(',');
    sendXtResponse(socket, 'chatRoomMemberList', {
        chatRoomName: chatRoomName,
        memberNames: memberNames
    });
}

// Handler for exitChatRoom command
function handleExitChatRoom(socket, params) {
    const { chatRoomName } = params;
    
    const chatRoom = chatRooms[chatRoomName];
    if (!chatRoom) {
        sendXtResponse(socket, 'chatRoomError', {
            reason: 'Room does not exist',
            chatRoomName: chatRoomName
        });
        return;
    }
    
    // Remove user from the chat room
    chatRoom.users = chatRoom.users.filter(user => user.id !== socket.userId);
    chatRoom.userCount = chatRoom.users.length;
    
    // Send success response to the leaving user
    sendXtResponse(socket, 'chatRoomExited', {
        chatRoomName: chatRoomName
    });
    
    // Broadcast to all other users in the room that someone left
    broadcastToChatRoom(chatRoomName, 'userLeftChatRoom', {
        chatRoomName: chatRoomName,
        username: socket.userName
    });
    
    // If room is now empty, destroy the room and notify others
    if (chatRoom.users.length === 0 && chatRoomName !== 'General' && chatRoomName !== 'Lobby') {
        // Broadcast that the room has been destroyed
        broadcastToChatRoom(chatRoomName, 'chatRoomDestroyed', {
            chatRoomName: chatRoomName,
            reason: 'Room is empty'
        });
        delete chatRooms[chatRoomName];
    }
}

// Handler for removeUserFromChatRoom command
function handleRemoveUserFromChatRoom(socket, params) {
    const { chatRoomName, username } = params;
    
    const chatRoom = chatRooms[chatRoomName];
    if (!chatRoom) {
        sendXtResponse(socket, 'chatRoomError', {
            reason: 'Room does not exist',
            chatRoomName: chatRoomName
        });
        return;
    }
    
    // Find the user to remove by username
    const userToRemove = chatRoom.users.find(user => user.name === username);
    if (!userToRemove) {
        sendXtResponse(socket, 'chatRoomError', {
            reason: 'User not found in room',
            chatRoomName: chatRoomName,
            username: username
        });
        return;
    }
    
    // Remove user from the chat room
    chatRoom.users = chatRoom.users.filter(user => user.id !== userToRemove.id);
    chatRoom.userCount = chatRoom.users.length;
    
    // Get the socket for the removed user
    const removedUserSocket = socketMap[userToRemove.id];
    if (removedUserSocket) {
        // Send notification to the removed user
        sendXtResponse(removedUserSocket, 'userRemovedFromChatRoom', {
            chatRoomName: chatRoomName,
            reason: 'Removed by moderator'
        });
    }
    
    // Broadcast to all other users in the room that someone was removed
    broadcastToChatRoom(chatRoomName, 'userRemovedFromChatRoom', {
        chatRoomName: chatRoomName,
        username: username
    });
    
    // Send confirmation to the moderator who initiated the removal
    sendXtResponse(socket, 'userRemovedConfirmation', {
        chatRoomName: chatRoomName,
        username: username
    });
    
    // If room is now empty, destroy the room and notify others
    if (chatRoom.users.length === 0 && chatRoomName !== 'General' && chatRoomName !== 'Lobby') {
        // Broadcast that the room has been destroyed
        broadcastToChatRoom(chatRoomName, 'chatRoomDestroyed', {
            chatRoomName: chatRoomName,
            reason: 'Room is empty'
        });
        delete chatRooms[chatRoomName];
    }
}

// Handler for sendChatMessage command
function handleSendChatMessage(socket, params) {
    const { chatRoomName, message } = params;
    
    const chatRoom = chatRooms[chatRoomName];
    if (!chatRoom) {
        sendXtResponse(socket, 'chatRoomError', {
            reason: 'Room does not exist',
            chatRoomName: chatRoomName
        });
        return;
    }
    
    // Check if user is in the room
    const userInRoom = chatRoom.users.some(user => user.id === socket.userId);
    if (!userInRoom) {
        sendXtResponse(socket, 'chatRoomError', {
            reason: 'User not in room',
            chatRoomName: chatRoomName
        });
        return;
    }
    
    // Determine if this is a public or private chat room for the client
    const isPublicRoom = chatRoomName === 'General' || chatRoomName === 'Lobby';
    const chatRoomType = isPublicRoom ? 'PUBLIC' : 'PRIVATE';

    // Broadcast the message to all users in the room
    broadcastToChatRoom(chatRoomName, 'sendChatMessage', {
        chatRoomName: chatRoomName,
        username: socket.userName,
        avatarId: users[socket.userId]?.avatarId || 1,
        message: message,
        nmp: users[socket.userId]?.nmp || 0
    });
}

// Main handler function that routes commands to specific handlers
function handleChatXtCommand(socket, command, params) {
    console.log(`Handling chatXt command: ${command}, params:`, params);

    // Log the extension request for debugging
    debug.logExtensionRequest('chatXt', command, params, {
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort,
        userId: socket.userId,
        userName: socket.userName,
        playerId: socket.playerId
    });

    switch (command) {
        case 'getChatRoomList':
            handleGetChatRoomList(socket, params);
            break;
            
        case 'inviteToChat':
            handleInviteToChat(socket, params);
            break;
            
        case 'replyChatInvitation':
            handleReplyChatInvitation(socket, params);
            break;
            
        case 'joinChatRoom':
            handleJoinChatRoom(socket, params);
            break;
            
        case 'exitChatRoom':
            handleExitChatRoom(socket, params);
            break;
            
        case 'removeUserFromChatRoom':
            handleRemoveUserFromChatRoom(socket, params);
            break;
            
        case 'sendChatMessage':
            handleSendChatMessage(socket, params);
            break;
            
        default:
            console.log(`Unknown chatXt command: ${command}`);

            // Log invalid chatXt command
            debug.logInvalidRequest('chatXt', command, params, {
                remoteAddress: socket.remoteAddress,
                remotePort: socket.remotePort,
                userId: socket.userId,
                userName: socket.userName,
                playerId: socket.playerId
            });

            sendXtResponse(socket, 'unknownCommand', {
                command: command
            });
            break;
    }
}

module.exports = handleChatXtCommand;