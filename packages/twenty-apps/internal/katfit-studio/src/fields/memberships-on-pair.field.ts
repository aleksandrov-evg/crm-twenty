import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership.object';
import { PAIR_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/pair.object';
import { MEMBERSHIPS_ON_PAIR_FIELD_UNIVERSAL_IDENTIFIER, PAIR_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER } from './pair-on-membership.field';

export default defineField({
  universalIdentifier: MEMBERSHIPS_ON_PAIR_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: PAIR_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION, name: 'studioMemberships', label: 'Сплит-блоки', icon: 'IconTicket',
  relationTargetObjectMetadataUniversalIdentifier: MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: PAIR_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
