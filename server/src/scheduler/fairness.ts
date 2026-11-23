import { FAIRNESS_WEIGHTS } from '../../../shared/constants';
import {
  AccessRequest,
  Equipment,
  FairnessBreakdown,
  FairnessFactorScores,
  ProjectType,
  User,
} from '../../../shared/types';

export interface FairnessCalculationInput {
  user: User;
  equipment: Equipment;
  startTime: string;
  endTime: string;
  projectType: ProjectType;
  deadline: string | null;
  requestCreatedAt: string;
  previousBookingsCount: number;
  evaluationTimeMs?: number;
}

const PROJECT_PRIORITY_SCORES: Record<ProjectType, number> = {
  CAPSTONE: 100,
  RESEARCH: 90,
  COURSEWORK: 75,
  CLUB: 50,
  PERSONAL: 30,
};

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Deterministic 7-factor fairness scoring:
 * Weights: 25 (waitTime) + 20 (historicalUsage) + 15 (deadlineUrgency)
 *        + 10 (trainingCompliance) + 10 (academicPriority)
 *        + 10 (durationEfficiency) + 10 (departmentAlignment) = 100.
 */
export function calculateFairnessScore(input: FairnessCalculationInput): FairnessBreakdown {
  const evalNowMs = input.evaluationTimeMs ?? Date.parse(input.requestCreatedAt);
  const createdMs = Date.parse(input.requestCreatedAt);

  // 1. Wait Time (weight 25): Scales linearly from 0 to 100 over 72 hours of waiting.
  const waitHours =
    Number.isFinite(evalNowMs) && Number.isFinite(createdMs)
      ? Math.max(0, (evalNowMs - createdMs) / 3_600_000)
      : 0;
  const waitTime = clampScore((waitHours / 72) * 100);

  // 2. Historical Usage Equity (weight 20): Fewer past confirmed bookings yields higher priority.
  const prevCount = Math.max(0, Math.floor(input.previousBookingsCount));
  const historicalUsage = clampScore(100 - Math.min(10, prevCount) * 10);

  // 3. Deadline Urgency (weight 15): Missing deadline defaults to 25; <=24h yields 100; decays to 20 at >=168h.
  let deadlineUrgency = 25;
  if (input.deadline) {
    const deadlineMs = Date.parse(input.deadline);
    if (Number.isFinite(deadlineMs) && Number.isFinite(evalNowMs)) {
      const hoursUntilDeadline = (deadlineMs - evalNowMs) / 3_600_000;
      if (hoursUntilDeadline <= 24) {
        deadlineUrgency = 100;
      } else if (hoursUntilDeadline >= 168) {
        deadlineUrgency = 20;
      } else {
        const fractionRemaining = (hoursUntilDeadline - 24) / (168 - 24);
        deadlineUrgency = clampScore(100 - fractionRemaining * 80);
      }
    }
  }

  // 4. Training & Safety Compliance (weight 10):
  let trainingCompliance = 100;
  if (input.equipment.safetyRequirements.length > 0 && !input.user.safetyCleared) {
    trainingCompliance = 0;
  } else if (input.equipment.requiredTrainings.length > 0) {
    const completed = new Set(input.user.completedTrainings);
    const matched = input.equipment.requiredTrainings.filter((t) => completed.has(t)).length;
    trainingCompliance = clampScore((matched / input.equipment.requiredTrainings.length) * 100);
  }

  // 5. Academic Priority (weight 10): Deterministic map from ProjectType.
  const academicPriority = PROJECT_PRIORITY_SCORES[input.projectType] ?? 30;

  // 6. Duration Efficiency (weight 10): Concise slots score higher relative to equipment max duration.
  const startMs = Date.parse(input.startTime);
  const endMs = Date.parse(input.endTime);
  const durationMinutes =
    Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
      ? (endMs - startMs) / 60000
      : 0;
  const maxDur = Math.max(1, input.equipment.maxBookingDurationMinutes);
  let durationEfficiency = 0;
  if (durationMinutes > 0 && durationMinutes <= maxDur) {
    const ratio = durationMinutes / maxDur;
    if (ratio <= 0.5) {
      durationEfficiency = 100;
    } else {
      durationEfficiency = clampScore(100 - ((ratio - 0.5) / 0.5) * 60);
    }
  }

  // 7. Department Alignment (weight 10): Home department = 100, cross-department sharing = 60.
  const departmentAlignment =
    input.user.department.trim().toLowerCase() === input.equipment.department.trim().toLowerCase()
      ? 100
      : 60;

  const factors: FairnessFactorScores = {
    waitTime,
    historicalUsage,
    deadlineUrgency,
    trainingCompliance,
    academicPriority,
    durationEfficiency,
    departmentAlignment,
  };

  const weightedSum =
    factors.waitTime * FAIRNESS_WEIGHTS.waitTime +
    factors.historicalUsage * FAIRNESS_WEIGHTS.historicalUsage +
    factors.deadlineUrgency * FAIRNESS_WEIGHTS.deadlineUrgency +
    factors.trainingCompliance * FAIRNESS_WEIGHTS.trainingCompliance +
    factors.academicPriority * FAIRNESS_WEIGHTS.academicPriority +
    factors.durationEfficiency * FAIRNESS_WEIGHTS.durationEfficiency +
    factors.departmentAlignment * FAIRNESS_WEIGHTS.departmentAlignment;

  const weightedTotal = Math.round((weightedSum / 100) * 100) / 100;

  return {
    factors,
    weights: { ...FAIRNESS_WEIGHTS },
    weightedTotal,
  };
}

/**
 * Deterministic ordering for competing requests:
 * 1. Higher fairness score
 * 2. Earlier deadline (explicit deadlines precede null deadlines)
 * 3. Fewer previous bookings
 * 4. Stable lexicographical request ID ordering
 */
export function compareRequestsDeterministic(
  a: Pick<AccessRequest, 'id' | 'priorityScore' | 'deadline' | 'requesterId'>,
  b: Pick<AccessRequest, 'id' | 'priorityScore' | 'deadline' | 'requesterId'>,
  previousBookingsByUser: Readonly<Record<string, number>> = {},
): number {
  if (a.priorityScore !== b.priorityScore) {
    return b.priorityScore - a.priorityScore;
  }

  const aDeadline = a.deadline ? Date.parse(a.deadline) : Number.POSITIVE_INFINITY;
  const bDeadline = b.deadline ? Date.parse(b.deadline) : Number.POSITIVE_INFINITY;
  const safeADeadline = Number.isNaN(aDeadline) ? Number.POSITIVE_INFINITY : aDeadline;
  const safeBDeadline = Number.isNaN(bDeadline) ? Number.POSITIVE_INFINITY : bDeadline;

  if (safeADeadline !== safeBDeadline) {
    return safeADeadline - safeBDeadline;
  }

  const prevA = previousBookingsByUser[a.requesterId] ?? 0;
  const prevB = previousBookingsByUser[b.requesterId] ?? 0;
  if (prevA !== prevB) {
    return prevA - prevB;
  }

  return a.id.localeCompare(b.id);
}
