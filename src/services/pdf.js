const pdf = require('pdf-parse');

/**
 * Extracts text content from a PDF buffer.
 * @param {Buffer} buffer - The PDF file buffer.
 * @returns {Promise<string>} - The extracted text.
 */
async function extractTextFromPdf(buffer) {
    try {
        const data = await pdf(buffer);
        // Clean up excessive newlines and whitespace
        return data.text
            .replace(/\n\s*\n/g, '\n')
            .replace(/\s+/g, ' ')
            .trim();
    } catch (err) {
        console.error("❌ [PDF SERVICE] Error parsing PDF:", err.message);
        throw new Error("Failed to parse PDF document.");
    }
}

module.exports = { extractTextFromPdf };
