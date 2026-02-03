/**
 * User profile creation, session lookup, and user data persistence.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const state = require('./state');
const utils = require('./lib/utils');

const { users, sessions } = state;
const { generateUniqueId, formatDateForNanovor } = utils;

function createUserProfile(accountId, username) {
    const userProfile = {
        id: accountId,
        username: username,
        screenname: username,
        email: `${username}@nanovor.example.com`,
        phoneNumber: "",
        nanocash: 1000,
        nmp: 0,
        nanovorCount: 2,
        nanovorCountUnique: 2,
        ems: 0,
        healthJolts: 0,
        armorJolts: 0,
        strengthJolts: 0,
        speedJolts: 0,
        avatarId: 1,
        breadcrumbCount: 0,
        gamesWon: 0,
        gamesPlayed: 0,
        totalKills: 0,
        hexiteKills: 0,
        magnamodKills: 0,
        velocitronKills: 0,
        twoPlayerGames: 0,
        threePlayerGames: 0,
        fourPlayerGames: 0,
        battleCount: 0,
        hasSeenNewUserExperience: false,
        created: new Date(),
        lastLogin: new Date(),
        online: true,
        nanovorInventory: [
            {
                id: 1,
                name: "Electropod 1.0",
                faction: "Magnamod",
                rarity: "common",
                wave: 1,
                health: 100,
                armor: 5,
                speed: 10,
                strength: 120,
                pv: 175,
                type: "virmon",
                assetTypeId: 1,
                assetId: generateUniqueId(),
                productionNumber: 1,
                birthDate: formatDateForNanovor(new Date()),
                lastEvolutionDate: formatDateForNanovor(new Date()),
                killCount: 0,
                lifetimeKillCount: 0,
                battleCount: 0,
                lifetimeBattleCount: 0,
                deathCount: 0,
                lifetimeDeathCount: 0,
                magnamodKillCount: 0,
                magnamodLifetimeKillCount: 0,
                hexiteKillCount: 0,
                hexiteLifetimeKillCount: 0,
                velocitronKillCount: 0,
                velocitronLifetimeKillCount: 0,
                winCount: 0,
                lifetimeWinCount: 0,
                criticalHitCount: 0,
                whiffCount: 0,
                isScreenStar: false,
                isScrapedBy: false,
                areAllAttacksUsed: false,
                isSlacker: false,
                maxDamageGame: 0,
                maxDamageHit: 0,
                maxRoundCount: 0,
                nickname: ""
            },
            {
                id: 24,
                name: "Doom Blade 1.0",
                faction: "Velocitron",
                rarity: "common",
                wave: 1,
                health: 100,
                armor: 0,
                speed: 25,
                strength: 85,
                pv: 160,
                type: "virmon",
                assetTypeId: 24,
                assetId: generateUniqueId(),
                productionNumber: 1,
                birthDate: formatDateForNanovor(new Date()),
                lastEvolutionDate: formatDateForNanovor(new Date()),
                killCount: 0,
                lifetimeKillCount: 0,
                battleCount: 0,
                lifetimeBattleCount: 0,
                deathCount: 0,
                lifetimeDeathCount: 0,
                magnamodKillCount: 0,
                magnamodLifetimeKillCount: 0,
                hexiteKillCount: 0,
                hexiteLifetimeKillCount: 0,
                velocitronKillCount: 0,
                velocitronLifetimeKillCount: 0,
                winCount: 0,
                lifetimeWinCount: 0,
                criticalHitCount: 0,
                whiffCount: 0,
                isScreenStar: false,
                isScrapedBy: false,
                areAllAttacksUsed: false,
                isSlacker: false,
                maxDamageGame: 0,
                maxDamageHit: 0,
                maxRoundCount: 0,
                nickname: ""
            }
        ],
        emInventory: [
            {
                id: "em_1007",
                name: "1M1",
                type: "em",
                assetTypeId: 1007,
                assetId: uuidv4().substring(0, 8),
                productionNumber: 1,
                birthDate: formatDateForNanovor(new Date()),
                lastEvolutionDate: formatDateForNanovor(new Date()),
                nickname: ""
            },
            {
                id: "em_1013",
                name: "1V1",
                type: "em",
                assetTypeId: 1013,
                assetId: uuidv4().substring(0, 8),
                productionNumber: 1,
                birthDate: formatDateForNanovor(new Date()),
                lastEvolutionDate: formatDateForNanovor(new Date()),
                nickname: ""
            }
        ],
        badges: []
    };

    return userProfile;
}

function findSessionByToken(token) {
    for (const sessionId in sessions) {
        if (sessions[sessionId].loginToken === token) {
            return sessions[sessionId];
        }
    }
    return null;
}

function saveUserData(userId) {
    if (!users[userId]) {
        console.log(`User ${userId} not found, cannot save data`);
        return;
    }

    const userDataDir = path.join(__dirname, 'UserData');
    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
    }

    const username = users[userId].username;
    console.log(`[${new Date().toISOString()}] Saving user data for username: '${username}', userId: '${userId}'`);
    const fileName = username.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(userDataDir, `${fileName}.json`);
    const userData = { ...users[userId] };

    delete userData.online;

    try {
        fs.writeFileSync(filePath, JSON.stringify(userData, null, 2));
        console.log(`Saved user data for ${username} (ID: ${userId}) to ${filePath}`);
    } catch (error) {
        console.error(`Error saving user data for ${username} (ID: ${userId}):`, error);
    }
}

function loadUserDataByUsername(username) {
    const userDataDir = path.join(__dirname, 'UserData');
    const fileName = username.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(userDataDir, `${fileName}.json`);

    if (fs.existsSync(filePath)) {
        try {
            const userData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const userId = userData.id;

            if (!userData.emInventory || userData.emInventory.length === 0) {
                console.log(`User ${username} (ID: ${userId}) has no EMs, adding starting EMs`);
                userData.emInventory = [
                    {
                        id: "em_1007",
                        name: "1M1",
                        type: "em",
                        assetTypeId: 1007,
                        assetId: uuidv4().substring(0, 8),
                        productionNumber: 1,
                        birthDate: formatDateForNanovor(new Date()),
                        lastEvolutionDate: formatDateForNanovor(new Date()),
                        nickname: ""
                    },
                    {
                        id: "em_1013",
                        name: "1V1",
                        type: "em",
                        assetTypeId: 1013,
                        assetId: uuidv4().substring(0, 8),
                        productionNumber: 1,
                        birthDate: formatDateForNanovor(new Date()),
                        lastEvolutionDate: formatDateForNanovor(new Date()),
                        nickname: ""
                    }
                ];

                userData.ems = userData.emInventory.length;
                saveUserData(userId);
            }

            users[userId] = { ...userData, online: false };
            console.log(`Loaded user data for ${username} (ID: ${userId}) from ${filePath}`);
            console.log(`Loaded user nanovor inventory:`, userData.nanovorInventory);
            console.log(`Loaded user em inventory:`, userData.emInventory);
            console.log(`Full loaded user nanovor inventory:`, JSON.stringify(userData.nanovorInventory, null, 2));
            return users[userId];
        } catch (error) {
            console.error(`Error loading user data for ${username}:`, error);
            return null;
        }
    } else {
        console.log(`User data file does not exist for ${username} at ${filePath}`);
    }
    return null;
}

function loadUserData(userId) {
    const userDataDir = path.join(__dirname, 'UserData');
    if (!fs.existsSync(userDataDir)) {
        return null;
    }

    const files = fs.readdirSync(userDataDir);
    for (const file of files) {
        if (file.endsWith('.json')) {
            try {
                const userData = JSON.parse(fs.readFileSync(path.join(userDataDir, file), 'utf8'));
                if (userData.id === userId) {
                    users[userId] = { ...userData, online: false };
                    console.log(`Loaded user data for ${userData.username} (ID: ${userId}) from ${file}`);
                    return users[userId];
                }
            } catch (error) {
                console.error(`Error loading user data from ${file}:`, error);
            }
        }
    }
    return null;
}

function loadAllUserData() {
    const userDataDir = path.join(__dirname, 'UserData');
    if (!fs.existsSync(userDataDir)) {
        console.log('UserData directory does not exist, no users to load');
        return;
    }

    const files = fs.readdirSync(userDataDir);
    let loadedUsers = 0;

    for (const file of files) {
        if (file.endsWith('.json')) {
            const filePath = path.join(userDataDir, file);
            try {
                const userData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const username = userData.username;
                if (username) {
                    loadUserDataByUsername(username);
                    loadedUsers++;
                }
            } catch (error) {
                console.error(`Error loading user data from ${file}:`, error);
            }
        }
    }

    console.log(`Loaded ${loadedUsers} user profiles from saved data`);
}

module.exports = {
    createUserProfile,
    findSessionByToken,
    saveUserData,
    loadUserDataByUsername,
    loadUserData,
    loadAllUserData
};
