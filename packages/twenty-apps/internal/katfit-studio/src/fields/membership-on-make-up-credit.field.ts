import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';
import { MAKE_UP_CREDIT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/make-up-credit.object';
import { MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership.object';

export const MEMBERSHIP_ON_MAKE_UP_CREDIT_FIELD_UNIVERSAL_IDENTIFIER = 'e19c8c47-2e49-4cc0-8b9e-57a3726816ea';
export const MAKE_UP_CREDITS_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER = 'df28d35a-8c4e-44e0-a970-42029eb24054';
export default defineField({ universalIdentifier: MEMBERSHIP_ON_MAKE_UP_CREDIT_FIELD_UNIVERSAL_IDENTIFIER, objectUniversalIdentifier: MAKE_UP_CREDIT_OBJECT_UNIVERSAL_IDENTIFIER, type: FieldType.RELATION, name: 'membership', label: 'Пакет клиента', icon: 'IconTicket', relationTargetObjectMetadataUniversalIdentifier: MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER, relationTargetFieldMetadataUniversalIdentifier: MAKE_UP_CREDITS_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER, universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.SET_NULL, joinColumnName: 'membershipId' } });
