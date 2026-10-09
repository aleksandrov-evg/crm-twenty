import { defineField, FieldType, RelationType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

import { PAIR_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/pair.object';
import { FIRST_PERSON_ON_PAIR_FIELD_UNIVERSAL_IDENTIFIER, PAIRS_AS_FIRST_PERSON_FIELD_UNIVERSAL_IDENTIFIER } from './first-person-on-pair.field';

export default defineField({
  universalIdentifier: PAIRS_AS_FIRST_PERSON_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION, name: 'studioPairsAsFirstPerson', label: 'Пары: первый участник', icon: 'IconUsers',
  relationTargetObjectMetadataUniversalIdentifier: PAIR_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: FIRST_PERSON_ON_PAIR_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
