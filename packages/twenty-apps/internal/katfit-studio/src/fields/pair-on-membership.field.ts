import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership.object';
import { PAIR_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/pair.object';

export const PAIR_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER = '0320eb07-fd59-4ecd-b490-2dc431838b38';
export const MEMBERSHIPS_ON_PAIR_FIELD_UNIVERSAL_IDENTIFIER = '4a26e84f-0f9f-42f3-8b23-1ef925d66390';

export default defineField({
  universalIdentifier: PAIR_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION, name: 'pair', label: 'Пара', icon: 'IconUsers',
  relationTargetObjectMetadataUniversalIdentifier: PAIR_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: MEMBERSHIPS_ON_PAIR_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.RESTRICT, joinColumnName: 'pairId' },
});
