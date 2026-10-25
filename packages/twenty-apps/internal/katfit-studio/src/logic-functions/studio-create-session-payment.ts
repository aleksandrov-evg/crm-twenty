import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import {
  createSessionPayment,
  type SessionPaymentInput,
} from 'src/logic-functions/handlers/create-session-payment-handler';

export default defineLogicFunction({
  universalIdentifier: '394874cb-c6e7-40b3-acf0-b44ce2d5a890',
  name: 'studio-create-session-payment',
  description:
    'Prepare a received single-session payment or future debt before saving a session',
  timeoutSeconds: 30,
  handler: async (payload: RoutePayload<SessionPaymentInput>) => {
    try {
      const result = await createSessionPayment(
        (payload.body ?? {}) as SessionPaymentInput,
      );
      return new Response(result, {
        status: result.success ? 200 : result.status,
      });
    } catch {
      return new Response(
        {
          success: false,
          code: 'SESSION_PAYMENT_UNCONFIRMED',
          message:
            'Результат оплаты не подтверждён. Повторите прежний запрос с тем же ключом.',
        },
        { status: 500 },
      );
    }
  },
  httpRouteTriggerSettings: {
    path: '/studio/sessions/payment',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
