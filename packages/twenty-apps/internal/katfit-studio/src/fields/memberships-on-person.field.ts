import { defineField, FieldType, RelationType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

import { MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership.object';
import { MEMBERSHIPS_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER, PERSON_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER } from './person-on-membership.field';

export default defineField({
  universalIdentifier: MEMBERSHIPS_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION, name: 'studioMemberships', label: 'Пакеты студии', icon: 'IconTicket',
  relationTargetObjectMetadataUniversalIdentifier: MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: PERSON_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
