import { defineField, FieldType, OnDeleteAction, RelationType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

export const PERSON_ON_OPPORTUNITY_FIELD_UNIVERSAL_IDENTIFIER = '446d3c41-4b13-4f05-a824-e4053b82b6f7';
export const OPPORTUNITIES_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER = '349f114b-e656-40f2-97e4-7b1705a105ba';

export default defineField({
  universalIdentifier: PERSON_ON_OPPORTUNITY_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.universalIdentifier,
  type: FieldType.RELATION,
  name: 'studioClient',
  label: 'Клиент студии',
  icon: 'IconUser',
  relationTargetObjectMetadataUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier: OPPORTUNITIES_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.SET_NULL, joinColumnName: 'studioClientId' },
});
