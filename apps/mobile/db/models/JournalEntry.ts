import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, text } from '@nozbe/watermelondb/decorators';

export default class JournalEntry extends Model {
  static override table = 'journal_entries';
  static override associations = {
    daily_entries: { type: 'belongs_to' as const, key: 'daily_entry_id' },
  };

  @text('server_id') serverId!: string | null;
  @text('daily_entry_id') dailyEntryId!: string | null;
  @text('patient_id') patientId!: string;
  @text('body') body!: string;
  @field('word_count') wordCount!: number;
  @field('is_shared_with_care_team') isSharedWithCareTeam!: boolean;
  @text('created_at_iso') createdAtIso!: string;
  @field('is_dirty') isDirty!: boolean;
  @field('synced_at') syncedAt!: number | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
