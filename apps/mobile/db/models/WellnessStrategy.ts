import { Model } from '@nozbe/watermelondb';
import { date, readonly, text } from '@nozbe/watermelondb/decorators';

export default class WellnessStrategy extends Model {
  static table = 'wellness_strategies';

  @text('server_id') serverId!: string;
  @text('name') name!: string;
  @text('category') category!: string | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
