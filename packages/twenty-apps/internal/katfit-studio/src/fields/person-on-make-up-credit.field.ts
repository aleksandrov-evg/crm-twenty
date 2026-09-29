import { defineField, FieldType, OnDeleteAction, RelationType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';
import { MAKE_UP_CREDIT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/make-up-credit.object';

export const PERSON_ON_MAKE_UP_CREDIT_FIELD_UNIVERSAL_IDENTIFIER = 'ae63dc2d-017e-4993-8382-7db464198e22';
export const MAKE_UP_CREDITS_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER = '5a79cc5a-c2d2-4358-b111-6764c9305082';
export default defineField({ universalIdentifier: PERSON_ON_MAKE_UP_CREDIT_FIELD_UNIVERSAL_IDENTIFIER, objectUniversalIdentifier: MAKE_UP_CREDIT_OBJECT_UNIVERSAL_IDENTIFIER, type: FieldType.RELATION, name: 'person', label: 'Клиент', icon: 'IconUser', relationTargetObjectMetadataUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier, relationTargetFieldMetadataUniversalIdentifier: MAKE_UP_CREDITS_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER, universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.SET_NULL, joinColumnName: 'personId' } });
