import { defineView, ViewType } from 'twenty-sdk/define';

import { CLASS_SESSION_NAME_FIELD_UNIVERSAL_IDENTIFIER, CLASS_SESSION_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/class-session.object';
import { GROUP_ON_SESSION_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/group-on-session.field';

export default defineView({
  universalIdentifier: '82cd7b0d-efb2-4164-881e-ed9d669be7e6', name: 'Расписание занятий',
  objectUniversalIdentifier: CLASS_SESSION_OBJECT_UNIVERSAL_IDENTIFIER, type: ViewType.TABLE, icon: 'IconCalendarEvent', position: 0,
  fields: [
    { universalIdentifier: '78a36670-030d-4810-a781-505a4c15bc7f', fieldMetadataUniversalIdentifier: CLASS_SESSION_NAME_FIELD_UNIVERSAL_IDENTIFIER, position: 0, isVisible: true, size: 240 },
    { universalIdentifier: 'de385308-2c35-4c32-85fb-7acc1d491055', fieldMetadataUniversalIdentifier: GROUP_ON_SESSION_FIELD_UNIVERSAL_IDENTIFIER, position: 1, isVisible: true, size: 220 },
  ],
});
