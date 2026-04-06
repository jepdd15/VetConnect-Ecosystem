import { calculatePulseMetrics } from './VetConnect-Admin/src/utils/pulseUtils.js';

// Mock Settings (Closed Sunday)
const settings = {
    openHour: 8,
    closeHour: 17,
    workingDays: [1, 2, 3, 4, 5, 6] // Monday - Saturday
};

// Date helper
const dateAt = (dayOffset, hour, min) => {
    const d = new Date('2026-04-06T12:00:00'); // Fixed baseline for testing (Monday)
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, min, 0, 0);
    return d;
};

// 🧬 SCENARIO 1: Early Bird Arrives at 7:00 AM (Monday)
// Clinic opens at 8:00 AM. If we check at 9:00 AM, it should be 120M (2H).
const scenario1Pulse = [
    { toStatus: 'arrived', timestamp: dateAt(0, 7, 0), eventId: 'ev1' }
];
const metrics1 = calculatePulseMetrics(scenario1Pulse, settings, dateAt(0, 7, 0), new Date('2026-04-06T09:00:00'));
console.log('--- SCENARIO 1: Early Bird (7AM Arrival) ---');
console.log('Metric Total Queue:', metrics1.totalQueue);
// In business mode, 7AM to 9AM is now 120M because Finding 1 is fixed.

// 🧬 SCENARIO 2: Sunday Hospitalization (Absolute 24/7)
// Arrive Friday 5PM. Confined Saturday 5PM. Check Monday 9AM.
// Sunday is closed day (day -1 relative to today's Monday).
const friday5PM = dateAt(-3, 17, 0);
const saturday5PM = dateAt(-2, 17, 0);
const monday9AM = dateAt(0, 9, 0);

const scenario2Pulse = [
    { toStatus: 'arrived', timestamp: friday5PM, eventId: 'ev_a' },
    { toStatus: 'in-consult', timestamp: saturday5PM, eventId: 'ev_b' },
    { toStatus: 'confined', timestamp: saturday5PM, eventId: 'ev_c' }
];
const metrics2 = calculatePulseMetrics(scenario2Pulse, settings, friday5PM, monday9AM);
console.log('\n--- SCENARIO 2: Sunday Hospitalization ---');
console.log('Total Confined (Should capture full weekend stay):', metrics2.totalConfined);
console.log('Total Consult (Should exclude confinement time):', metrics2.totalConsult);
