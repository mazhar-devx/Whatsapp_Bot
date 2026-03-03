const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
require("dotenv").config();
const apiKey = process.env.GROQ_API_KEY;
const fs = require('fs');

async function checkModels() {
    try {
        const res = await fetch("https://api.groq.com/openai/v1/models", {
            headers: { Authorization: `Bearer ${apiKey}` }
        });
        const data = await res.json();
        fs.writeFileSync('models.json', JSON.stringify(data.data.map(m => m.id), null, 2), 'utf8');
    } catch (err) {
        console.error(err);
    }
}
checkModels();
