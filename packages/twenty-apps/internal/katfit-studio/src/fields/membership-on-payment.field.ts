import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';
import { MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership.object';
import { PAYMENT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/payment.object';

export const MEMBERSHIP_ON_PAYMENT_FIELD_UNIVERSAL_IDENTIFIER = '8b348167-11a0-4bd5-ac36-64f45f855a3b';
export const PAYMENTS_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER = 'e1c88ab0-e0e7-4869-bdab-b2e7c6e28182';
export default defineField({ universalIdentifier: MEMBERSHIP_ON_PAYMENT_FIELD_UNIVERSAL_IDENTIFIER, objectUniversalIdentifier: PAYMENT_OBJECT_UNIVERSAL_IDENTIFIER, type: FieldType.RELATION, name: 'membership', label: 'Пакет клиента', icon: 'IconTicket', relationTargetObjectMetadataUniversalIdentifier: MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER, relationTargetFieldMetadataUniversalIdentifier: PAYMENTS_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER, universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.SET_NULL, joinColumnName: 'membershipId' } });
