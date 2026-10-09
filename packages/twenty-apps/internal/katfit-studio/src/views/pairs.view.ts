import { defineView, ViewType } from 'twenty-sdk/define';

import { FIRST_PERSON_ON_PAIR_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/first-person-on-pair.field';
import { SECOND_PERSON_ON_PAIR_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/second-person-on-pair.field';
import { PAIR_NAME_FIELD_UNIVERSAL_IDENTIFIER, PAIR_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/pair.object';

export default defineView({
  universalIdentifier: 'aab910cc-702a-4b7a-952a-d5e15e625601',
  name: 'Пары',
  objectUniversalIdentifier: PAIR_OBJECT_UNIVERSAL_IDENTIFIER,
  type: ViewType.TABLE,
  icon: 'IconUsers',
  position: 0,
  fields: [
    { universalIdentifier: '9bbc5d34-9e5e-4ece-a606-5cc026de4cb5', fieldMetadataUniversalIdentifier: PAIR_NAME_FIELD_UNIVERSAL_IDENTIFIER, position: 0, isVisible: true, size: 200 },
    { universalIdentifier: 'b7e3d1e3-a059-4936-8ab5-372cc1d4d21b', fieldMetadataUniversalIdentifier: FIRST_PERSON_ON_PAIR_FIELD_UNIVERSAL_IDENTIFIER, position: 1, isVisible: true, size: 190 },
    { universalIdentifier: 'ce274a38-6b0f-41bd-b415-0d91d11eb143', fieldMetadataUniversalIdentifier: SECOND_PERSON_ON_PAIR_FIELD_UNIVERSAL_IDENTIFIER, position: 2, isVisible: true, size: 190 },
  ],
});
