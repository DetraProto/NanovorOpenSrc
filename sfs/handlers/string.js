/**
 * SFS string message handler (% protocol).
 */

function handleStringMessage(socket, message) {
    console.log('String message received:', message);
    const parts = message.split('%');
    if (parts.length > 0) {
        const msgType = parts[0];
        console.log(`String message type: ${msgType}`);
    }
}

module.exports = handleStringMessage;
