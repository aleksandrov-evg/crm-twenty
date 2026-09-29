import { defineIndex } from 'twenty-sdk/define';
import { PRODUCT_CODE_FIELD_UNIVERSAL_IDENTIFIER, PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/product.object';

export default defineIndex({ universalIdentifier: '4a255482-5308-428c-91fa-f88e3fd02e9d', objectUniversalIdentifier: PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER, isUnique: true, fields: [
  { universalIdentifier: '63e8ca5d-0c14-4840-a335-ad5bcaea3457', fieldUniversalIdentifier: PRODUCT_CODE_FIELD_UNIVERSAL_IDENTIFIER },
  { universalIdentifier: '92f2a401-5d35-41da-bd91-f8d7f9c5a4f7', fieldUniversalIdentifier: '05104633-4907-48ad-9021-4ce9c321a307' },
] });
