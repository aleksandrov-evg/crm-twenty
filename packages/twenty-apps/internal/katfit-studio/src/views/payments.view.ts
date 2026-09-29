import { defineView, ViewType } from 'twenty-sdk/define';
import { PERSON_ON_PAYMENT_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/person-on-payment.field';
import { PAYMENT_NAME_FIELD_UNIVERSAL_IDENTIFIER, PAYMENT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/payment.object';

export default defineView({ universalIdentifier: 'b8d19ec9-3b2f-405a-bcd5-c7cf56630ae8', name: 'Все оплаты', objectUniversalIdentifier: PAYMENT_OBJECT_UNIVERSAL_IDENTIFIER, type: ViewType.TABLE, icon: 'IconCash', position: 0, fields: [
  { universalIdentifier: 'aafef6f3-f5ad-4b28-8bc3-979544cf52fc', fieldMetadataUniversalIdentifier: PAYMENT_NAME_FIELD_UNIVERSAL_IDENTIFIER, position: 0, isVisible: true, size: 240 },
  { universalIdentifier: '0a28305d-a4d7-49d3-b87d-24dde3ea2bb6', fieldMetadataUniversalIdentifier: PERSON_ON_PAYMENT_FIELD_UNIVERSAL_IDENTIFIER, position: 1, isVisible: true, size: 190 },
] });
