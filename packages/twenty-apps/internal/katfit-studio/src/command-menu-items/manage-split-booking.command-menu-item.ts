import { defineCommandMenuItem } from 'twenty-sdk/define';
import { MANAGE_SPLIT_BOOKING_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER } from 'src/front-components/manage-split-booking.front-component';
import { BOOKING_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/booking.object';

export default defineCommandMenuItem({ universalIdentifier: 'e2c88fa0-9e4d-4702-a9d7-305cedb3adcc', label: 'Управление сплит-записью', shortLabel: 'Сплит-запись', isPinned: true, availabilityType: 'RECORD_SELECTION', availabilityObjectUniversalIdentifier: BOOKING_OBJECT_UNIVERSAL_IDENTIFIER, frontComponentUniversalIdentifier: MANAGE_SPLIT_BOOKING_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER });
