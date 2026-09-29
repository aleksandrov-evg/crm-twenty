import { defineView, ViewType } from 'twenty-sdk/define';

import { MEMBERSHIP_NAME_FIELD_UNIVERSAL_IDENTIFIER, MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership.object';
import { PERSON_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/person-on-membership.field';
import { PRODUCT_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/product-on-membership.field';

export default defineView({
  universalIdentifier: '7e8998d0-92c6-4d57-af0c-0c1038819651', name: 'Пакеты клиентов',
  objectUniversalIdentifier: MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER, type: ViewType.TABLE, icon: 'IconTicket', position: 0,
  fields: [
    { universalIdentifier: '70f11407-fdc2-4bed-8090-353e62790729', fieldMetadataUniversalIdentifier: MEMBERSHIP_NAME_FIELD_UNIVERSAL_IDENTIFIER, position: 0, isVisible: true, size: 240 },
    { universalIdentifier: '9aa511c4-b8a1-4c34-8de3-52887f22bdf9', fieldMetadataUniversalIdentifier: PERSON_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER, position: 1, isVisible: true, size: 190 },
    { universalIdentifier: '7ba21ee4-d6af-4070-b11a-e1ccfe5a6938', fieldMetadataUniversalIdentifier: PRODUCT_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER, position: 2, isVisible: true, size: 210 },
  ],
});
