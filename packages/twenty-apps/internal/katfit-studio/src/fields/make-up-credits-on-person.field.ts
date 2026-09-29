import { defineField, FieldType, RelationType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';
import { MAKE_UP_CREDIT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/make-up-credit.object';
import { MAKE_UP_CREDITS_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER, PERSON_ON_MAKE_UP_CREDIT_FIELD_UNIVERSAL_IDENTIFIER } from './person-on-make-up-credit.field';

export default defineField({ universalIdentifier: MAKE_UP_CREDITS_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER, objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier, type: FieldType.RELATION, name: 'makeUpCredits', label: 'Отработки', icon: 'IconCalendarRepeat', relationTargetObjectMetadataUniversalIdentifier: MAKE_UP_CREDIT_OBJECT_UNIVERSAL_IDENTIFIER, relationTargetFieldMetadataUniversalIdentifier: PERSON_ON_MAKE_UP_CREDIT_FIELD_UNIVERSAL_IDENTIFIER, universalSettings: { relationType: RelationType.ONE_TO_MANY } });
