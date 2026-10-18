import { recoverCalendarSessionCreation } from '../recover-calendar-session-creation';
import { type CalendarSessionCommand } from '../../domain/create-calendar-session-command';
import { type CalendarCreationInspection } from '../../crm/inspect-calendar-session-creation';
import { type CalendarSessionCreationResult } from '../../crm/create-calendar-session';

const command: CalendarSessionCommand = {
  name: 'Тренировка',
  sessionFormat: 'GROUP_REFORMER',
  startsAt: '2099-01-10T09:00:00Z',
  durationMinutes: 60,
  capacity: 6,
  status: 'PLANNED',
  idempotencyKey: `calendar-create:${'a'.repeat(64)}`,
  participants: [],
};
const confirmed: CalendarCreationInspection = {
  status: 'confirmed',
  classSessionId: 'session',
  recordingKey: `session-create:${command.idempotencyKey}`,
};
const setup = (before: CalendarCreationInspection) => ({
  command: { ...command, participants: [] } as CalendarSessionCommand,
  inspect: jest
    .fn<Promise<CalendarCreationInspection>, [CalendarSessionCommand]>()
    .mockResolvedValueOnce(before)
    .mockResolvedValue(confirmed),
  send: jest
    .fn<Promise<CalendarSessionCreationResult>, [CalendarSessionCommand]>()
    .mockResolvedValue({
      status: 'confirmed',
      classSessionId: 'session',
      duplicate: false,
    }),
  authorizeSend: jest.fn<Promise<boolean>, []>().mockResolvedValue(true),
});

describe('creation recovery', () => {
  it('does not recreate a previously known session when it disappears', async () => {
    const input = setup({ status: 'absent' });
    expect(
      await recoverCalendarSessionCreation({
        ...input,
        expectedClassSessionId: 'known',
      }),
    ).toMatchObject({
      status: 'needs-review',
      reason: 'KNOWN_CRM_IDENTITY_MISSING_OR_CHANGED',
    });
    expect(input.send).not.toHaveBeenCalled();
  });
  it('does not replay a completed command', async () => {
    const input = setup(confirmed);
    expect(await recoverCalendarSessionCreation(input)).toEqual(confirmed);
    expect(input.send).not.toHaveBeenCalled();
    expect(input.authorizeSend).not.toHaveBeenCalled();
  });
  it.each([
    { status: 'absent' },
    { status: 'incomplete', classSessionId: 'session' },
  ] as const)(
    'sends the same frozen command only after inspecting and authorizing %s',
    async (before) => {
      const input = setup(before);
      expect(await recoverCalendarSessionCreation(input)).toEqual(confirmed);
      expect(input.send).toHaveBeenCalledTimes(1);
      expect(input.send).toHaveBeenCalledWith(command);
      expect(input.inspect.mock.calls[0][0]).toBe(
        input.inspect.mock.calls[1][0],
      );
    },
  );
  it('recovers a lost response through a matching creation audit', async () => {
    const input = setup({ status: 'absent' });
    input.send.mockResolvedValue({ status: 'unconfirmed' });
    expect(await recoverCalendarSessionCreation(input)).toEqual(confirmed);
  });
  it('does not accept a successful POST without confirmed audit', async () => {
    const input = setup({ status: 'absent' });
    input.inspect.mockReset().mockResolvedValue({ status: 'absent' });
    expect(await recoverCalendarSessionCreation(input)).toEqual({
      status: 'unconfirmed',
    });
    expect(input.send).toHaveBeenCalledTimes(1);
  });
  it.each([
    { status: 'unavailable' },
    { status: 'needs-review', reason: 'CONFLICT' },
    { status: 'auth-required' },
  ] as const)('does not send after inspection failure %s', async (before) => {
    const input = setup(before);
    expect(await recoverCalendarSessionCreation(input)).toEqual(before);
    expect(input.send).not.toHaveBeenCalled();
  });
  it('stops if the source changed before sending', async () => {
    const input = setup({ status: 'absent' });
    input.authorizeSend.mockResolvedValue(false);
    expect(await recoverCalendarSessionCreation(input)).toMatchObject({
      status: 'needs-review',
    });
    expect(input.send).not.toHaveBeenCalled();
  });
  it('requires review when recovered identity differs from the original partial creation', async () => {
    const input = setup({ status: 'incomplete', classSessionId: 'different' });
    expect(await recoverCalendarSessionCreation(input)).toEqual({
      status: 'needs-review',
      reason: 'CRM_IDENTITY_CHANGED_DURING_CREATION',
    });
  });
  it('requires review when POST and audit report different identities', async () => {
    const input = setup({ status: 'absent' });
    input.send.mockResolvedValue({
      status: 'confirmed',
      classSessionId: 'different',
      duplicate: false,
    });
    expect(await recoverCalendarSessionCreation(input)).toMatchObject({
      status: 'needs-review',
      reason: 'CRM_IDENTITY_CHANGED_DURING_CREATION',
    });
  });
  it('never creates an absent training in the past', async () => {
    const input = setup({ status: 'absent' });
    input.command.startsAt = '2020-01-10T09:00:00Z';
    expect(await recoverCalendarSessionCreation(input)).toMatchObject({
      status: 'needs-review',
      reason: 'PAST_OR_CURRENT_EVENT',
    });
    expect(input.send).not.toHaveBeenCalled();
  });
  it('preserves the snapshot while an external caller changes its source object', async () => {
    const input = setup({ status: 'absent' });
    input.authorizeSend.mockImplementation(async () => {
      input.command.capacity = 99;
      return true;
    });
    await recoverCalendarSessionCreation(input);
    expect(input.send).toHaveBeenCalledWith(
      expect.objectContaining({ capacity: 6 }),
    );
    expect(Object.isFrozen(input.send.mock.calls[0][0])).toBe(true);
  });
  it('treats a thrown sender error as unconfirmed without retrying', async () => {
    const input = setup({ status: 'absent' });
    input.send.mockRejectedValue(new Error('secret'));
    expect(await recoverCalendarSessionCreation(input)).toEqual({
      status: 'unconfirmed',
    });
    expect(input.send).toHaveBeenCalledTimes(1);
  });
});
