import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';

import { PAIR_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/pair.object';

export default defineNavigationMenuItem({
  universalIdentifier: 'a2e55140-c468-48e5-9d68-11a22693de5a',
  position: 5,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: PAIR_OBJECT_UNIVERSAL_IDENTIFIER,
});
