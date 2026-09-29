import { defineField, FieldType, RelationType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';
import { GROUP_MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/group-membership.object';
import { GROUP_MEMBERSHIPS_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER, PERSON_ON_GROUP_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER } from './person-on-group-membership.field';

export default defineField({ universalIdentifier: GROUP_MEMBERSHIPS_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER, objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier, type: FieldType.RELATION, name: 'groupMemberships', label: 'Участие в группах', icon: 'IconUsersGroup', relationTargetObjectMetadataUniversalIdentifier: GROUP_MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER, relationTargetFieldMetadataUniversalIdentifier: PERSON_ON_GROUP_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER, universalSettings: { relationType: RelationType.ONE_TO_MANY } });
