import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { recordPastAttendance } from 'src/logic-functions/handlers/record-past-attendance-handler';
import { type RecordPastAttendanceInput } from 'src/logic-functions/utils/past-attendance';

const handler = async (
  routePayload: RoutePayload<RecordPastAttendanceInput>,
  context: { userWorkspaceId: string | null },
): Promise<Response> => {
  const result = await recordPastAttendance((routePayload.body ?? {}) as RecordPastAttendanceInput, context);
  return new Response(result, { status: result.success ? 200 : result.status });
};

export default defineLogicFunction({
  universalIdentifier: '8d033b79-d0e8-4aa3-aae0-796c995eff70',
  name: 'studio-record-past-attendance',
  description: 'Record a completed class and consume one visit from a paid package',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/studio/attendance/record-past',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
