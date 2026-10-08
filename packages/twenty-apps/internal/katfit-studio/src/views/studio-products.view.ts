import { defineView, ViewType } from 'twenty-sdk/define';

import { PRODUCT_CODE_FIELD_UNIVERSAL_IDENTIFIER, PRODUCT_DURATION_MINUTES_FIELD_UNIVERSAL_IDENTIFIER, PRODUCT_NAME_FIELD_UNIVERSAL_IDENTIFIER, PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/product.object';

export default defineView({
  universalIdentifier: '6b29f422-3f01-45e5-88b4-169e7a19edc9', name: 'Все продукты',
  objectUniversalIdentifier: PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER, type: ViewType.TABLE, icon: 'IconPackage', position: 0,
  fields: [
    { universalIdentifier: '3ab5b182-dc02-4caf-a9d5-387ec2b8ca47', fieldMetadataUniversalIdentifier: PRODUCT_NAME_FIELD_UNIVERSAL_IDENTIFIER, position: 0, isVisible: true, size: 240 },
    { universalIdentifier: '955573fa-af9b-4b23-a886-45eea0cf1443', fieldMetadataUniversalIdentifier: PRODUCT_CODE_FIELD_UNIVERSAL_IDENTIFIER, position: 1, isVisible: true, size: 200 },
    { universalIdentifier: 'c513afb1-32fd-4cb2-8adb-2d68c3010897', fieldMetadataUniversalIdentifier: PRODUCT_DURATION_MINUTES_FIELD_UNIVERSAL_IDENTIFIER, position: 2, isVisible: true, size: 140 },
  ],
});
