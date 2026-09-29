import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';
import { MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership.object';

export default defineNavigationMenuItem({ universalIdentifier: '73d07385-aa6f-4eb2-b321-09753a6d3e86', position: 4, type: NavigationMenuItemType.OBJECT, targetObjectUniversalIdentifier: MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER });
