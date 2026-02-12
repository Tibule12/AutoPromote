
require('dotenv').config();
const promotionService = require('./promotionService');

const scheduleId = 'Ol0fW8J9NYJ6Wd76tUjh'; // The Facebook one

async function run() {
    console.log(`Forcing execution of schedule ${scheduleId}...`);
    try {
        const result = await promotionService.executePromotion(scheduleId);
        console.log('Result:', result);
    } catch (e) {
        console.error('Error:', e);
    }
}

run();
