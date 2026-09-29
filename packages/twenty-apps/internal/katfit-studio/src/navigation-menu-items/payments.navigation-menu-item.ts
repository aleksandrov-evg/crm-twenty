import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';
import { PAYMENT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/payment.object';

export default defineNavigationMenuItem({ universalIdentifier: '075f99a1-0856-4ded-a813-49f81f7ac5eb', position: 5, type: NavigationMenuItemType.OBJECT, targetObjectUniversalIdentifier: PAYMENT_OBJECT_UNIVERSAL_IDENTIFIER });
