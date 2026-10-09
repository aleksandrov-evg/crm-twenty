import { defineField, FieldType, OnDeleteAction, RelationType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

import { PAIR_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/pair.object';

export const FIRST_PERSON_ON_PAIR_FIELD_UNIVERSAL_IDENTIFIER = '24abbf3f-953c-4864-92d1-2160d5103ce4';
export const PAIRS_AS_FIRST_PERSON_FIELD_UNIVERSAL_IDENTIFIER = 'af69a333-389b-45be-ab6e-d01ce623d779';

export default defineField({
  universalIdentifier: FIRST_PERSON_ON_PAIR_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: PAIR_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION, name: 'firstPerson', label: 'Первый участник', icon: 'IconUser',
  relationTargetObjectMetadataUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier: PAIRS_AS_FIRST_PERSON_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.RESTRICT, joinColumnName: 'firstPersonId' },
});
