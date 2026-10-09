import { defineCommandMenuItem } from 'twenty-sdk/define';
import { CREATE_SPLIT_BOOKING_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER } from 'src/front-components/create-split-booking.front-component';
import { PAIR_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/pair.object';

export default defineCommandMenuItem({ universalIdentifier: '6f08a40a-4d83-4c89-89f2-51fad89c6a6d', label: 'Записать на сплит', shortLabel: 'Запись на сплит', isPinned: true, availabilityType: 'RECORD_SELECTION', availabilityObjectUniversalIdentifier: PAIR_OBJECT_UNIVERSAL_IDENTIFIER, frontComponentUniversalIdentifier: CREATE_SPLIT_BOOKING_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER });
