import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, text } from '@nozbe/watermelondb/decorators';

export default class DailyEntryTrigger extends Model {
  static override table = 'daily_entry_triggers';
  static override associations = {
    daily_entries: { type: 'belongs_to' as const, key: 'daily_entry_id' },
  };

  @text('server_id') serverId!: string | null;
  @text('daily_entry_id') dailyEntryId!: string;
  @text('trigger_id') triggerId!: string;
  @field('severity') severity!: number;
  @field('is_dirty') isDirty!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
