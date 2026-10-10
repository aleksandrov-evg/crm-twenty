import { defineCommandMenuItem } from 'twenty-sdk/define';

import { CONFIRM_SPLIT_PAYMENT_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER } from 'src/front-components/confirm-split-payment.front-component';
import { PAIR_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/pair.object';

export default defineCommandMenuItem({
  universalIdentifier: 'eaed0294-330e-4c9d-a8c4-e55a7ff112fe',
  label: 'Оформить сплит-блок', shortLabel: 'Сплит-блок', isPinned: true,
  availabilityType: 'RECORD_SELECTION', availabilityObjectUniversalIdentifier: PAIR_OBJECT_UNIVERSAL_IDENTIFIER,
  frontComponentUniversalIdentifier: CONFIRM_SPLIT_PAYMENT_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
});
