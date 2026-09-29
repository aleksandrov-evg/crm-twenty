import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';
import { MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership.object';
import { MEMBERSHIP_TRANSACTION_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership-transaction.object';

export const MEMBERSHIP_ON_TRANSACTION_FIELD_UNIVERSAL_IDENTIFIER = '2b8b48da-ef39-41c2-990c-bc2fbf6d8bd5';
export const TRANSACTIONS_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER = '702a0040-d1db-4a48-8486-b0a5808c466b';
export default defineField({ universalIdentifier: MEMBERSHIP_ON_TRANSACTION_FIELD_UNIVERSAL_IDENTIFIER, objectUniversalIdentifier: MEMBERSHIP_TRANSACTION_OBJECT_UNIVERSAL_IDENTIFIER, type: FieldType.RELATION, name: 'membership', label: 'Пакет клиента', icon: 'IconTicket', relationTargetObjectMetadataUniversalIdentifier: MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER, relationTargetFieldMetadataUniversalIdentifier: TRANSACTIONS_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER, universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.SET_NULL, joinColumnName: 'membershipId' } });
