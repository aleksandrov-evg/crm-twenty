import { defineField, FieldType, RelationType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

import { PAIR_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/pair.object';
import { PAIRS_AS_SECOND_PERSON_FIELD_UNIVERSAL_IDENTIFIER, SECOND_PERSON_ON_PAIR_FIELD_UNIVERSAL_IDENTIFIER } from './second-person-on-pair.field';

export default defineField({
  universalIdentifier: PAIRS_AS_SECOND_PERSON_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION, name: 'studioPairsAsSecondPerson', label: 'Пары: второй участник', icon: 'IconUsers',
  relationTargetObjectMetadataUniversalIdentifier: PAIR_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: SECOND_PERSON_ON_PAIR_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
