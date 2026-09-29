import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { CLASS_GROUP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/class-group.object';
import { CLASS_SESSION_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/class-session.object';
import { GROUP_ON_SESSION_FIELD_UNIVERSAL_IDENTIFIER, SESSIONS_ON_GROUP_FIELD_UNIVERSAL_IDENTIFIER } from './group-on-session.field';

export default defineField({
  universalIdentifier: SESSIONS_ON_GROUP_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: CLASS_GROUP_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION, name: 'classSessions', label: 'Занятия', icon: 'IconCalendarEvent',
  relationTargetObjectMetadataUniversalIdentifier: CLASS_SESSION_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: GROUP_ON_SESSION_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
