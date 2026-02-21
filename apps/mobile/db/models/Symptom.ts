import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, text } from '@nozbe/watermelondb/decorators';

export default class Symptom extends Model {
  static table = 'symptoms';

  @text('server_id') serverId!: string;
  @text('name') name!: string;
  @field('is_safety_symptom') isSafetySymptom!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
