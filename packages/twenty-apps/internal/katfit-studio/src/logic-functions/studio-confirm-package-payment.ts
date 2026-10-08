import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { confirmPackagePayment } from 'src/logic-functions/handlers/confirm-package-payment-handler';
import { type ConfirmPackagePaymentInput } from 'src/logic-functions/utils/package-payment';

const handler = async (
  routePayload: RoutePayload<ConfirmPackagePaymentInput>,
  context: { userWorkspaceId: string | null },
): Promise<Response> => {
  const result = await confirmPackagePayment(
    (routePayload.body ?? {}) as ConfirmPackagePaymentInput,
    context,
  );

  return new Response(result, {
    status: result.success ? 200 : result.status,
  });
};

export default defineLogicFunction({
  universalIdentifier: '0f5807fe-5b0b-4cbe-8ba8-c4142148fb7e',
  name: 'studio-confirm-package-payment',
  description:
    'Confirm a package payment, create the client package and grant its visits',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/studio/package-payments/confirm',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
