import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership.object';
import { PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/product.object';

export const PRODUCT_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER = 'b35c7d36-5b14-4fd7-b76c-84e54333d6dc';
export const MEMBERSHIPS_ON_PRODUCT_FIELD_UNIVERSAL_IDENTIFIER = '22a048bd-2b2c-4a92-b528-dae814dc7489';

export default defineField({
  universalIdentifier: PRODUCT_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION, name: 'product', label: 'Продукт', icon: 'IconPackage',
  relationTargetObjectMetadataUniversalIdentifier: PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: MEMBERSHIPS_ON_PRODUCT_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.SET_NULL, joinColumnName: 'productId' },
});
