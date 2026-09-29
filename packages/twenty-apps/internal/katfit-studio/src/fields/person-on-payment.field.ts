import { defineField, FieldType, OnDeleteAction, RelationType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';
import { PAYMENT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/payment.object';

export const PERSON_ON_PAYMENT_FIELD_UNIVERSAL_IDENTIFIER = '83352d10-3f0d-4ced-a8ab-f63362ee0050';
export const PAYMENTS_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER = '06fdcd48-d043-4cfb-8607-386954436759';
export default defineField({ universalIdentifier: PERSON_ON_PAYMENT_FIELD_UNIVERSAL_IDENTIFIER, objectUniversalIdentifier: PAYMENT_OBJECT_UNIVERSAL_IDENTIFIER, type: FieldType.RELATION, name: 'person', label: 'Клиент', icon: 'IconUser', relationTargetObjectMetadataUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier, relationTargetFieldMetadataUniversalIdentifier: PAYMENTS_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER, universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.SET_NULL, joinColumnName: 'personId' } });
