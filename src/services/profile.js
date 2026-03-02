const fs = require("fs").promises;
const path = require("path");

const PROFILES_DIR = path.join(__dirname, "../../user_files/profiles");

/**
 * Gets or initializes a user profile.
 */
async function getProfile(senderJid, initialName = "User") {
    const profilePath = path.join(PROFILES_DIR, `${senderJid.replace(/[:@.]/g, "_")}.json`);

    try {
        await fs.mkdir(PROFILES_DIR, { recursive: true });
        const data = await fs.readFile(profilePath, "utf8");
        const profile = JSON.parse(data);
        profile.last_seen = new Date().toISOString();
        await saveProfile(senderJid, profile);
        return profile;
    } catch (err) {
        const newProfile = {
            name: initialName,
            relationship: "Friend",
            interests: [],
            notes: "",
            deviceType: "Unknown",
            location: "Unknown",
            profilePicUrl: null,
            last_seen: new Date().toISOString(),
            created_at: new Date().toISOString()
        };
        await saveProfile(senderJid, newProfile);
        return newProfile;
    }
}

/**
 * Saves a user profile.
 */
async function saveProfile(senderJid, profile) {
    const profilePath = path.join(PROFILES_DIR, `${senderJid.replace(/[:@.]/g, "_")}.json`);
    try {
        await fs.mkdir(PROFILES_DIR, { recursive: true });
        await fs.writeFile(profilePath, JSON.stringify(profile, null, 2));
    } catch (err) {
        console.error("❌ [PROFILE] Error saving profile:", err.message);
    }
}

module.exports = { getProfile, saveProfile };
