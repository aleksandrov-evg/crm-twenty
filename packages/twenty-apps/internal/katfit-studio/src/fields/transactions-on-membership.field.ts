import { defineField, FieldType, RelationType } from 'twenty-sdk/define';
import { MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership.object';
import { MEMBERSHIP_TRANSACTION_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership-transaction.object';
import { MEMBERSHIP_ON_TRANSACTION_FIELD_UNIVERSAL_IDENTIFIER, TRANSACTIONS_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER } from './membership-on-transaction.field';

export default defineField({ universalIdentifier: TRANSACTIONS_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER, objectUniversalIdentifier: MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER, type: FieldType.RELATION, name: 'transactions', label: 'Операции', icon: 'IconListDetails', relationTargetObjectMetadataUniversalIdentifier: MEMBERSHIP_TRANSACTION_OBJECT_UNIVERSAL_IDENTIFIER, relationTargetFieldMetadataUniversalIdentifier: MEMBERSHIP_ON_TRANSACTION_FIELD_UNIVERSAL_IDENTIFIER, universalSettings: { relationType: RelationType.ONE_TO_MANY } });
