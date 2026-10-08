import {
  defineCommandMenuItem,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { CONFIRM_PACKAGE_PAYMENT_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER } from 'src/front-components/confirm-package-payment.front-component';

export default defineCommandMenuItem({
  universalIdentifier: '6399c6d8-aebd-476e-bf82-c7e652a37c53',
  label: 'Оформить оплату пакета',
  shortLabel: 'Оплата пакета',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  frontComponentUniversalIdentifier:
    CONFIRM_PACKAGE_PAYMENT_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
});
