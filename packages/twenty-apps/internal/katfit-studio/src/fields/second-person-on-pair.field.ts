import { defineField, FieldType, OnDeleteAction, RelationType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

import { PAIR_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/pair.object';

export const SECOND_PERSON_ON_PAIR_FIELD_UNIVERSAL_IDENTIFIER = 'd6b822c2-12ce-4775-82da-7e841bfc3abe';
export const PAIRS_AS_SECOND_PERSON_FIELD_UNIVERSAL_IDENTIFIER = '4b39eb16-bf35-435b-98c9-8eaf6fe2c8b2';

export default defineField({
  universalIdentifier: SECOND_PERSON_ON_PAIR_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: PAIR_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION, name: 'secondPerson', label: 'Второй участник', icon: 'IconUser',
  relationTargetObjectMetadataUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier: PAIRS_AS_SECOND_PERSON_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.RESTRICT, joinColumnName: 'secondPersonId' },
});
