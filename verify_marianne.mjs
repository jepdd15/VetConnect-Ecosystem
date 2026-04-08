import { calculatePulseMetrics } from './VetConnect-Admin/src/utils/pulseUtils.js';

// 🧬 MARIANNE FORENSIC MOCK (Sync'd with Screenshot)
const marianneStartedStr = "2026-04-07T16:42:00"; // 04:42 PM April 7
const marianneCreatedStr = "2026-04-07T16:37:00"; // Arrival was approx 5m before start
const currentAuditStr = "2026-04-08T14:10:00";    // 02:10 PM April 8

const mockPulse = [
    {
        eventId: 'evt_1',
        type: 'STATUS_CHANGE',
        toStatus: 'arrived',
        timestamp: { toDate: () => new Date(marianneCreatedStr) },
        staffName: 'Clinic Admin'
    },
    {
        eventId: 'evt_2',
        type: 'STATUS_CHANGE',
        toStatus: 'in-consult',
        timestamp: { toDate: () => new Date(marianneStartedStr) },
        staffName: 'Clinic Admin'
    }
];

const mockSettings = {
    openHour: 8,
    closeHour: 17,
    workingDays: [0, 1, 2, 3, 4, 5, 6]
};

const targetDate = new Date("2026-04-07T00:00:00"); // Auditing Day 1 (April 7)

// Override global Date for the simulation
const realDate = Date;
global.Date = class extends realDate {
    constructor(arg) {
        if (arg) return new realDate(arg);
        return new realDate(currentAuditStr);
    }
};

const metrics = calculatePulseMetrics(mockPulse, mockSettings, { toDate: () => new Date(marianneCreatedStr) }, targetDate);

console.log("--- 🕵️ FORENSIC TEMPORAL SIMULATION ---");
console.log(`RECORD AGE:    ${metrics.recordAge}`);
console.log(`TOTAL CONSULT: ${metrics.totalConsult}`);
console.log(`SHIFT CONSULT: ${metrics.shiftConsult}`);
console.log("---------------------------------------");

// Validation Logic
const totalConsultMins = metrics.raw.totalConsult;
const recordAgeMins = metrics.raw.recordAgeMins;

if (totalConsultMins < 440 && totalConsultMins > 430) {
    console.log("✅ SUCCESS: Total Consult correctly capped at Midnight Border (~437m).");
} else {
    console.log(`❌ FAILURE: Total Consult leaked! Actual: ${totalConsultMins}M`);
}

if (recordAgeMins > 1200) {
    console.log(`✅ SUCCESS: Record Age remains absolute (${recordAgeMins}M).`);
} else {
    console.log(`❌ FAILURE: Record Age was accidentally capped! Actual: ${recordAgeMins}M`);
}

global.Date = realDate;
