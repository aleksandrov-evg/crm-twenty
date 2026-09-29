import { defineField, FieldType, RelationType } from 'twenty-sdk/define';
import { MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership.object';
import { PAYMENT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/payment.object';
import { MEMBERSHIP_ON_PAYMENT_FIELD_UNIVERSAL_IDENTIFIER, PAYMENTS_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER } from './membership-on-payment.field';

export default defineField({ universalIdentifier: PAYMENTS_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER, objectUniversalIdentifier: MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER, type: FieldType.RELATION, name: 'payments', label: 'Оплаты', icon: 'IconCash', relationTargetObjectMetadataUniversalIdentifier: PAYMENT_OBJECT_UNIVERSAL_IDENTIFIER, relationTargetFieldMetadataUniversalIdentifier: MEMBERSHIP_ON_PAYMENT_FIELD_UNIVERSAL_IDENTIFIER, universalSettings: { relationType: RelationType.ONE_TO_MANY } });
