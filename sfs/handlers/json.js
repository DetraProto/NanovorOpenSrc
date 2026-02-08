/**
 * SFS JSON message handler - dispatches to extension handler.
 */

const handleExtensionCommand = require('./extension');

function handleJsonMessage(socket, message) {
    try {
        // Clean the message by removing null terminators and other non-JSON characters
        // The message might contain protocol-specific termination characters
        let cleanMessage = message.toString();

        // Remove null terminator and any trailing characters
        const nullTerminatorIndex = cleanMessage.indexOf('\x00');
        if (nullTerminatorIndex !== -1) {
            cleanMessage = cleanMessage.substring(0, nullTerminatorIndex);
        }

        // Remove any other trailing non-JSON characters
        // Find the last closing brace of the JSON object
        const lastBraceIndex = cleanMessage.lastIndexOf('}');
        if (lastBraceIndex !== -1) {
            cleanMessage = cleanMessage.substring(0, lastBraceIndex + 1);
        }

        const obj = JSON.parse(cleanMessage);
        const msgType = obj.t;

        if (msgType === 'xt') {
            const body = obj.b;
            const extension = body.x;
            const command = body.c;

            console.log(`Extension command: ${extension}.${command}`);

            handleExtensionCommand(socket, extension, command, body.p);
        }
    } catch (e) {
        console.error('Error parsing JSON message:', e);
        console.error('Raw message:', message);
    }
}

module.exports = handleJsonMessage;
