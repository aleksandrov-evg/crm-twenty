import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { BOOKING_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/booking.object';
import { PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/product.object';

export const PRODUCT_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER = 'a8b7ac4b-cbef-4416-853a-bf18680564ce';
export const BOOKINGS_ON_PRODUCT_FIELD_UNIVERSAL_IDENTIFIER = '801c7eb3-dd31-44c2-bb48-59c729c60c31';

export default defineField({
  universalIdentifier: PRODUCT_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION, name: 'product', label: 'Продукт', icon: 'IconPackage',
  relationTargetObjectMetadataUniversalIdentifier: PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: BOOKINGS_ON_PRODUCT_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.SET_NULL, joinColumnName: 'productId' },
});
