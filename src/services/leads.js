const fs = require("fs").promises;
const path = require("path");

const LEADS_FILE = path.join(__dirname, "../../user_files/leads.json");

/**
 * Adds a new lead to the central registry.
 */
async function addLead(senderJid, name, projectSummary) {
    let leads = [];
    try {
        const data = await fs.readFile(LEADS_FILE, "utf8");
        leads = JSON.parse(data);
    } catch (err) {
        // File doesn't exist or is empty
    }

    const newLead = {
        jid: senderJid,
        name: name,
        project: projectSummary,
        timestamp: new Date().toISOString()
    };

    // Check if lead already exists for this JID and project (to avoid duplicates)
    const exists = leads.find(l => l.jid === senderJid && l.project === projectSummary);
    if (!exists) {
        leads.push(newLead);
        await fs.writeFile(LEADS_FILE, JSON.stringify(leads, null, 2));
        console.log(`💼 [LEADS] New lead captured: ${name} - ${projectSummary}`);
        return true;
    }
    return false;
}

/**
 * Gets all collected leads.
 */
async function getAllLeads() {
    try {
        const data = await fs.readFile(LEADS_FILE, "utf8");
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
}

module.exports = { addLead, getAllLeads };
