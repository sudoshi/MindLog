// =============================================================================
// MindLog Mobile — WatermelonDB DailyEntry model
// =============================================================================

import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, text, nochange } from '@nozbe/watermelondb/decorators';

export default class DailyEntry extends Model {
  static table = 'daily_entries';
  static associations = {
    daily_entry_triggers: { type: 'has_many' as const, foreignKey: 'daily_entry_id' },
    daily_entry_symptoms: { type: 'has_many' as const, foreignKey: 'daily_entry_id' },
    daily_entry_strategies: { type: 'has_many' as const, foreignKey: 'daily_entry_id' },
    journal_entries: { type: 'has_many' as const, foreignKey: 'daily_entry_id' },
  };

  @text('server_id') serverId!: string | null;
  @text('patient_id') patientId!: string;
  @text('entry_date') entryDate!: string;
  @field('mood_score') moodScore!: number | null;
  @field('sleep_hours') sleepHours!: number | null;
  @field('exercise_minutes') exerciseMinutes!: number | null;
  @text('notes') notes!: string | null;
  @field('is_complete') isComplete!: boolean;
  @field('completion_pct') completionPct!: number;
  @field('core_complete') coreComplete!: boolean;
  @field('wellness_complete') wellnessComplete!: boolean;
  @field('triggers_complete') triggersComplete!: boolean;
  @field('symptoms_complete') symptomsComplete!: boolean;
  @field('journal_complete') journalComplete!: boolean;
  @text('submitted_at') submittedAt!: string | null;
  @field('synced_at') syncedAt!: number | null;
  @field('is_dirty') isDirty!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
