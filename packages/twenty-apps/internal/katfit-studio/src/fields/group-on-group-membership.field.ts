import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';
import { CLASS_GROUP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/class-group.object';
import { GROUP_MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/group-membership.object';

export const GROUP_ON_GROUP_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER = 'a69c012e-67f4-4d77-88bb-8d8dc0b8ecaf';
export const MEMBERSHIPS_ON_GROUP_FIELD_UNIVERSAL_IDENTIFIER = '534acbd0-a50c-4d70-a497-cc5bb26266d5';
export default defineField({ universalIdentifier: GROUP_ON_GROUP_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER, objectUniversalIdentifier: GROUP_MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER, type: FieldType.RELATION, name: 'classGroup', label: 'Постоянная группа', icon: 'IconUsersGroup', relationTargetObjectMetadataUniversalIdentifier: CLASS_GROUP_OBJECT_UNIVERSAL_IDENTIFIER, relationTargetFieldMetadataUniversalIdentifier: MEMBERSHIPS_ON_GROUP_FIELD_UNIVERSAL_IDENTIFIER, universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.SET_NULL, joinColumnName: 'classGroupId' } });
