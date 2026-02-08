# Nanovor Server

A Node.js server that emulates the original **SmartFoxServer** and **Service Request Broker (SRB)** backend for the Nanovor game. It allows the official (or compatible) Nanovor client to connect, log in, and play using HTTP/XML-RPC and a custom TCP protocol.

## Features

- **SRB (XML-RPC)** - Login/connect, session tokens, service endpoints
- **HTTP API** - Account, stats, bankfe, assets, manifests, device endpoints
- **SFS TCP server** - SmartFoxServer-style socket protocol (XML/JSON messages): login, rooms, extensions (loginXt, gameXt, chatXt, etc.), battles

## Requirements

- **Node.js** 16+ (tested on 25.x)
- **npm** (for dependencies)

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start
# or
node NanoServ.js
```

**HTTP server** runs on **port 8443**.  
**SFS (game socket) server** runs on **port 9339**.

---

## Windows PowerShell

If you see:

```text
running scripts is disabled on this system
```

when running `npm install` or `npm start`, use one of these:

**Option A - Use Node to run npm (no policy change):**
```powershell
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" start
```

**Option B - Allow scripts for your user (once):**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
Then `npm install` and `npm start` work as usual.

**Option C - Use Command Prompt (cmd)** for `npm`; no script policy there.

---

## Configuration

| Item | Purpose |
|------|--------|
| `version.INI` | Server version (major, minor, build). Optional; defaults to 0.0.0 if missing. |
| `Config/` | XML configs: `connection_settings.xml`, `LoginScreenConfig.xml`, etc. |
| `UserData/` | Created at runtime; one JSON file per user (by username). |
| `Manifests/` | Optional; manifest/asset files served to the client (e.g. AppManifest.xml). |

---

## Project Structure

```
NanovorOpenSrc/
|-- NanoServ.js          # Entry point: Express app, middleware, route registration, SFS server, listen & shutdown
|-- package.json
|-- version.INI
|-- config.js            # Loads version.INI and Config/*.xml
|-- state.js             # In-memory state: users, sessions, gameRooms, socketMap, battleRooms, etc.
|-- user.js              # User profiles, sessions, load/save UserData
|-- battle.js            # Battle helpers: sendMessageToUser, broadcastToBattle
|-- gameRooms.js         # Game room helpers: createGameRoom, getUserGameRoom, advanceTurn
|-- lib/
|   |-- srb.js           # SRB XML-RPC: param extraction, createSrbResponse
|   +-- utils.js         # generateToken, generateAccountId, formatDateForNanovor, etc.
|-- routes/              # HTTP routes
|   |-- index.js         # registerRoutes(app)
|   |-- srb.js           # POST /xmlrpc (SRB connect)
|   |-- shard.js         # GET /scws/ (shard list)
|   +-- rest.js          # All other routes (bankfe, stat, assets, manifests, test-login, ...)
|-- sfs/                 # SmartFoxServer TCP emulator
|   |-- server.js        # createSfsServer(), sfsPort; socket lifecycle, HTTP manifest handling, message dispatch
|   +-- handlers/
|       |-- xml.js       # handleXmlMessage (verChk, login, autoJoin, getRmList, logout, ...)
|       |-- json.js      # handleJsonMessage -> extension
|       |-- string.js    # handleStringMessage
|       |-- extension.js # handleExtensionCommand (loginXt, chatXt, gameXt, ...)
|       +-- gameXt.js    # handleGameXtCommand (battles, swarm, ready, etc.)
|-- Config/              # XML config files
+-- UserData/            # Created at runtime; user save files
```

---

## Ports

| Port | Service |
|------|--------|
| **8443** | HTTP (SRB, bankfe, account, assets, manifests, shard list, etc.) |
| **9339** | SFS TCP (game socket: login, rooms, extensions, battles). Also serves manifest requests over the same port when the client sends HTTP. |

---

## License

Open source. See repository for details.
