import { RecordCalendarCardDraggableContainer } from '@/object-record/record-calendar/record-calendar-card/components/RecordCalendarCardDraggableContainer';
import { RECORD_CALENDAR_CARD_DND_TYPE } from '@/object-record/record-calendar/constants/RecordCalendarCardDndType';
import { RECORD_CALENDAR_DAY_COLLISION_PRIORITY } from '@/object-record/record-calendar/constants/RecordCalendarDayCollisionPriority';
import { useRecordCalendarDaysRange } from '@/object-record/record-calendar/hooks/useRecordCalendarDaysRange';
import { recordCalendarSelectedDateComponentState } from '@/object-record/record-calendar/states/recordCalendarSelectedDateComponentState';
import { calendarDayRecordIdsComponentFamilySelector } from '@/object-record/record-calendar/states/selectors/calendarDayRecordsComponentFamilySelector';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { useUserTimezone } from '@/ui/input/components/internal/date/hooks/useUserTimezone';
import { useAtomComponentFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentFamilySelectorValue';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { styled } from '@linaria/react';
import { pointerIntersection } from '@dnd-kit/collision';
import { useDroppable } from '@dnd-kit/react';
import { Temporal } from 'temporal-polyfill';
import { isNonEmptyString } from '@sniptt/guards';
import { isSamePlainDate } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { ViewCalendarLayout } from '~/generated-metadata/graphql';

const TIME_GRID_START_HOUR = 6;
const TIME_GRID_END_HOUR = 22;
const TIME_GRID_HOUR_HEIGHT = 72;

const StyledContainer = styled.div<{ isDayLayout: boolean }>`
  display: grid;
  grid-template-columns: 56px repeat(${({ isDayLayout }) => (isDayLayout ? 1 : 7)}, minmax(0, 1fr));
  grid-template-rows: 32px auto;
  min-width: ${({ isDayLayout }) => (isDayLayout ? '0' : '1000px')};
`;

const StyledDayHeader = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  border-left: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.light};
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  justify-content: center;
`;

const StyledHours = styled.div`
  position: relative;
`;

const StyledHour = styled.span<{ top: number }>`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.xs};
  position: absolute;
  right: ${themeCssVariables.spacing[1]};
  top: ${({ top }) => `${top}px`};
  transform: translateY(-50%);
`;

const StyledDayColumn = styled.div`
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent ${TIME_GRID_HOUR_HEIGHT - 1}px,
    ${themeCssVariables.border.color.light} ${TIME_GRID_HOUR_HEIGHT - 1}px,
    ${themeCssVariables.border.color.light} ${TIME_GRID_HOUR_HEIGHT}px
  );
  border-left: 1px solid ${themeCssVariables.border.color.light};
  min-height: ${(TIME_GRID_END_HOUR - TIME_GRID_START_HOUR) * TIME_GRID_HOUR_HEIGHT}px;
  position: relative;
`;

const StyledCard = styled.div<{ top: number }>`
  left: ${themeCssVariables.spacing[1]};
  position: absolute;
  right: ${themeCssVariables.spacing[1]};
  top: ${({ top }) => `${top}px`};
`;

type RecordCalendarTimeGridDayProps = {
  day: Temporal.PlainDate;
  dateFieldName: string;
};

const RecordCalendarTimeGridDay = ({
  day,
  dateFieldName,
}: RecordCalendarTimeGridDayProps) => {
  const { userTimezone } = useUserTimezone();
  const recordIds = useAtomComponentFamilySelectorValue(
    calendarDayRecordIdsComponentFamilySelector,
    { day, timeZone: userTimezone },
  );

  const { isDropTarget, ref: dropRef } = useDroppable({
    id: day.toString(),
    collisionPriority: RECORD_CALENDAR_DAY_COLLISION_PRIORITY,
    collisionDetector: pointerIntersection,
    type: RECORD_CALENDAR_CARD_DND_TYPE,
    accept: RECORD_CALENDAR_CARD_DND_TYPE,
  });

  return (
    <StyledDayColumn
      ref={dropRef}
      aria-label={day.toString()}
      data-drop-target={isDropTarget}
    >
      {recordIds.map((recordId, index) => (
        <RecordCalendarTimeGridCard
          key={recordId}
          recordId={recordId}
          index={index}
          calendarDay={day.toString()}
          dateFieldName={dateFieldName}
          timeZone={userTimezone}
        />
      ))}
    </StyledDayColumn>
  );
};

type RecordCalendarTimeGridCardProps = {
  recordId: string;
  index: number;
  calendarDay: string;
  dateFieldName: string;
  timeZone: string;
};

const RecordCalendarTimeGridCard = ({
  recordId,
  index,
  calendarDay,
  dateFieldName,
  timeZone,
}: RecordCalendarTimeGridCardProps) => {
  const record = useAtomFamilyStateValue(recordStoreFamilyState, recordId);
  const recordDateTime = record?.[dateFieldName];

  if (!isNonEmptyString(recordDateTime)) {
    return null;
  }

  try {
    const startDateTime = Temporal.Instant.from(
      recordDateTime,
    ).toZonedDateTimeISO(timeZone);

    if (
      !isSamePlainDate(
        Temporal.PlainDate.from(calendarDay),
        startDateTime.toPlainDate(),
      )
    ) {
      return null;
    }

    const minutesFromGridStart =
      startDateTime.hour * 60 + startDateTime.minute - TIME_GRID_START_HOUR * 60;
    const top = Math.max(
      0,
      (minutesFromGridStart / 60) * TIME_GRID_HOUR_HEIGHT,
    );

    return (
      <StyledCard top={top}>
        <RecordCalendarCardDraggableContainer
          calendarDay={calendarDay}
          recordId={recordId}
          index={index}
        />
      </StyledCard>
    );
  } catch {
    try {
      const plainDateTime = Temporal.PlainDateTime.from(recordDateTime);

      if (
        !isSamePlainDate(
          Temporal.PlainDate.from(calendarDay),
          plainDateTime.toPlainDate(),
        )
      ) {
        return null;
      }

      const minutesFromGridStart =
        plainDateTime.hour * 60 +
        plainDateTime.minute -
        TIME_GRID_START_HOUR * 60;
      const top = Math.max(
        0,
        (minutesFromGridStart / 60) * TIME_GRID_HOUR_HEIGHT,
      );

      return (
        <StyledCard top={top}>
          <RecordCalendarCardDraggableContainer
            calendarDay={calendarDay}
            recordId={recordId}
            index={index}
          />
        </StyledCard>
      );
    } catch {
      try {
        const recordDay = Temporal.PlainDate.from(recordDateTime);

        if (!isSamePlainDate(Temporal.PlainDate.from(calendarDay), recordDay)) {
          return null;
        }

        return (
          <StyledCard top={0}>
            <RecordCalendarCardDraggableContainer
              calendarDay={calendarDay}
              recordId={recordId}
              index={index}
            />
          </StyledCard>
        );
      } catch {
        return null;
      }
    }
  }
};

type RecordCalendarTimeGridProps = {
  calendarLayout: ViewCalendarLayout;
  dateFieldName: string;
};

export const RecordCalendarTimeGrid = ({
  calendarLayout,
  dateFieldName,
}: RecordCalendarTimeGridProps) => {
  const recordCalendarSelectedDate = useAtomComponentStateValue(
    recordCalendarSelectedDateComponentState,
  );
  const { days, weekDayLabels } = useRecordCalendarDaysRange(
    recordCalendarSelectedDate,
    calendarLayout,
  );
  const visibleDays = days.flat();
  const isDayLayout = calendarLayout === ViewCalendarLayout.DAY;

  return (
    <StyledContainer isDayLayout={isDayLayout}>
      <div />
      {weekDayLabels.map((label) => (
        <StyledDayHeader key={label}>{label}</StyledDayHeader>
      ))}
      <StyledHours>
        {Array.from(
          { length: TIME_GRID_END_HOUR - TIME_GRID_START_HOUR + 1 },
          (_, index) => (
            <StyledHour key={index} top={index * TIME_GRID_HOUR_HEIGHT}>
              {`${String(TIME_GRID_START_HOUR + index).padStart(2, '0')}:00`}
            </StyledHour>
          ),
        )}
      </StyledHours>
      {visibleDays.map((day) => (
        <RecordCalendarTimeGridDay
          key={day.toString()}
          day={day}
          dateFieldName={dateFieldName}
        />
      ))}
    </StyledContainer>
  );
};
