import { defineField, FieldType, OnDeleteAction, RelationType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';
import { GROUP_MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/group-membership.object';

export const PERSON_ON_GROUP_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER = '4f1d320c-18bb-478d-82fe-8436c6f93cb8';
export const GROUP_MEMBERSHIPS_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER = '1433f300-c902-4cf8-bb04-2ccddfc88b93';
export default defineField({ universalIdentifier: PERSON_ON_GROUP_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER, objectUniversalIdentifier: GROUP_MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER, type: FieldType.RELATION, name: 'person', label: 'Клиент', icon: 'IconUser', relationTargetObjectMetadataUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier, relationTargetFieldMetadataUniversalIdentifier: GROUP_MEMBERSHIPS_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER, universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.SET_NULL, joinColumnName: 'personId' } });
