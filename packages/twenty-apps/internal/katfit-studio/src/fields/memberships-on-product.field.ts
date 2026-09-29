import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership.object';
import { PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/product.object';
import { MEMBERSHIPS_ON_PRODUCT_FIELD_UNIVERSAL_IDENTIFIER, PRODUCT_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER } from './product-on-membership.field';

export default defineField({
  universalIdentifier: MEMBERSHIPS_ON_PRODUCT_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION, name: 'memberships', label: 'Пакеты клиентов', icon: 'IconTicket',
  relationTargetObjectMetadataUniversalIdentifier: MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: PRODUCT_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
