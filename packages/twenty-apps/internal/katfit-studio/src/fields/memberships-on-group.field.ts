import { defineField, FieldType, RelationType } from 'twenty-sdk/define';
import { CLASS_GROUP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/class-group.object';
import { GROUP_MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/group-membership.object';
import { GROUP_ON_GROUP_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER, MEMBERSHIPS_ON_GROUP_FIELD_UNIVERSAL_IDENTIFIER } from './group-on-group-membership.field';

export default defineField({ universalIdentifier: MEMBERSHIPS_ON_GROUP_FIELD_UNIVERSAL_IDENTIFIER, objectUniversalIdentifier: CLASS_GROUP_OBJECT_UNIVERSAL_IDENTIFIER, type: FieldType.RELATION, name: 'groupMemberships', label: 'Участники', icon: 'IconUsers', relationTargetObjectMetadataUniversalIdentifier: GROUP_MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER, relationTargetFieldMetadataUniversalIdentifier: GROUP_ON_GROUP_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER, universalSettings: { relationType: RelationType.ONE_TO_MANY } });
