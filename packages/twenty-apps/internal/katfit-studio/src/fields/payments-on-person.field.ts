import { defineField, FieldType, RelationType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';
import { PAYMENT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/payment.object';
import { PAYMENTS_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER, PERSON_ON_PAYMENT_FIELD_UNIVERSAL_IDENTIFIER } from './person-on-payment.field';

export default defineField({ universalIdentifier: PAYMENTS_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER, objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier, type: FieldType.RELATION, name: 'studioPayments', label: 'Оплаты студии', icon: 'IconCash', relationTargetObjectMetadataUniversalIdentifier: PAYMENT_OBJECT_UNIVERSAL_IDENTIFIER, relationTargetFieldMetadataUniversalIdentifier: PERSON_ON_PAYMENT_FIELD_UNIVERSAL_IDENTIFIER, universalSettings: { relationType: RelationType.ONE_TO_MANY } });
