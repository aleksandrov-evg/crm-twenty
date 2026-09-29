import { defineField, FieldType, OnDeleteAction, RelationType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

import { MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership.object';

export const PERSON_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER = '66886c42-e355-4bf8-8351-e4e974af18d3';
export const MEMBERSHIPS_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER = 'e0718ef9-3414-44a9-93b7-e7bc05c2cb5c';

export default defineField({
  universalIdentifier: PERSON_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION, name: 'person', label: 'Клиент', icon: 'IconUser',
  relationTargetObjectMetadataUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier: MEMBERSHIPS_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.SET_NULL, joinColumnName: 'personId' },
});
