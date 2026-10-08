import { defineCommandMenuItem } from 'twenty-sdk/define';

import { CLASS_SCHEDULE_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER } from 'src/front-components/class-schedule.front-component';

export default defineCommandMenuItem({
  universalIdentifier: '1bd4e4bf-7e0b-4e93-bcb1-0b7178da3a3f',
  label: 'Открыть расписание занятий',
  shortLabel: 'Расписание занятий',
  isPinned: true,
  availabilityType: 'GLOBAL',
  frontComponentUniversalIdentifier:
    CLASS_SCHEDULE_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
});
