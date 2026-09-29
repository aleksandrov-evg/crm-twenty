import { defineField, FieldType, RelationType } from 'twenty-sdk/define';
import { MAKE_UP_CREDIT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/make-up-credit.object';
import { MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership.object';
import { MAKE_UP_CREDITS_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER, MEMBERSHIP_ON_MAKE_UP_CREDIT_FIELD_UNIVERSAL_IDENTIFIER } from './membership-on-make-up-credit.field';

export default defineField({ universalIdentifier: MAKE_UP_CREDITS_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER, objectUniversalIdentifier: MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER, type: FieldType.RELATION, name: 'makeUpCredits', label: 'Отработки', icon: 'IconCalendarRepeat', relationTargetObjectMetadataUniversalIdentifier: MAKE_UP_CREDIT_OBJECT_UNIVERSAL_IDENTIFIER, relationTargetFieldMetadataUniversalIdentifier: MEMBERSHIP_ON_MAKE_UP_CREDIT_FIELD_UNIVERSAL_IDENTIFIER, universalSettings: { relationType: RelationType.ONE_TO_MANY } });
