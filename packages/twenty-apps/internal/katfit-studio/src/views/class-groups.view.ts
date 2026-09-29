import { defineView, ViewType } from 'twenty-sdk/define';

import { CLASS_GROUP_NAME_FIELD_UNIVERSAL_IDENTIFIER, CLASS_GROUP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/class-group.object';

export default defineView({
  universalIdentifier: 'f64678fb-f452-477f-95be-6c41588aca44', name: 'Постоянные группы',
  objectUniversalIdentifier: CLASS_GROUP_OBJECT_UNIVERSAL_IDENTIFIER, type: ViewType.TABLE, icon: 'IconUsersGroup', position: 0,
  fields: [{ universalIdentifier: '14efba44-a161-4282-a441-30c181720b2a', fieldMetadataUniversalIdentifier: CLASS_GROUP_NAME_FIELD_UNIVERSAL_IDENTIFIER, position: 0, isVisible: true, size: 260 }],
});
