import { Dexie, EntityTable } from 'dexie';
import { DbChat } from './Chat';
import { DbPersonality } from './Personality';

export interface Db extends Dexie {
    chats: EntityTable<DbChat, 'id'>;
    personalities: EntityTable<DbPersonality, 'id'>;
    personalities_uuid?: EntityTable<DbPersonality, 'id'>;
}
