// =============================================================================
// MindLog Mobile — WatermelonDB database initialisation
// =============================================================================

import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { schema } from './schema';
import DailyEntry from './models/DailyEntry';
import DailyEntryTrigger from './models/DailyEntryTrigger';
import DailyEntrySymptom from './models/DailyEntrySymptom';
import DailyEntryStrategy from './models/DailyEntryStrategy';
import JournalEntry from './models/JournalEntry';
import Trigger from './models/Trigger';
import Symptom from './models/Symptom';
import WellnessStrategy from './models/WellnessStrategy';

const adapter = new SQLiteAdapter({
  schema,
  dbName: 'mindlog',
  jsi: true, // use JSI for better performance on new arch
  onSetUpError: (error) => {
    console.error('[WatermelonDB] Setup error', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [
    DailyEntry,
    DailyEntryTrigger,
    DailyEntrySymptom,
    DailyEntryStrategy,
    JournalEntry,
    Trigger,
    Symptom,
    WellnessStrategy,
  ],
});

export { DailyEntry, DailyEntryTrigger, DailyEntrySymptom, DailyEntryStrategy, JournalEntry, Trigger, Symptom, WellnessStrategy };
