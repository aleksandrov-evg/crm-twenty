import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { CLASS_GROUP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/class-group.object';
import { CLASS_SESSION_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/class-session.object';

export const GROUP_ON_SESSION_FIELD_UNIVERSAL_IDENTIFIER = '1b8c7e7e-03a7-45b4-8df7-aa3e0eb804c2';
export const SESSIONS_ON_GROUP_FIELD_UNIVERSAL_IDENTIFIER = '91de3783-53b5-45d9-87dd-a2ea46cfa1c9';

export default defineField({
  universalIdentifier: GROUP_ON_SESSION_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: CLASS_SESSION_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION, name: 'classGroup', label: 'Постоянная группа', icon: 'IconUsersGroup',
  relationTargetObjectMetadataUniversalIdentifier: CLASS_GROUP_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: SESSIONS_ON_GROUP_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.SET_NULL, joinColumnName: 'classGroupId' },
});
