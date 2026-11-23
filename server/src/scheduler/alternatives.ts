import { DEFAULT_TIMEZONE } from '../../../shared/constants';
import {
  AlternativeEquipmentOption,
  AlternativeSuggestions,
  AlternativeTimeSlot,
  Booking,
  Equipment,
  MaintenanceWindow,
  User,
} from '../../../shared/types';
import { evaluateSchedulingConstraints } from './constraints';

export interface FindAlternativesInput {
  targetEquipment: Equipment;
  catalog: readonly Equipment[];
  user: User;
  requestedStartTime: string;
  requestedEndTime: string;
  bookings: readonly Booking[];
  maintenanceWindows: readonly MaintenanceWindow[];
  nowMs?: number;
  timeZone?: string;
  maxTimeSlots?: number;
  maxEquipmentOptions?: number;
}

export function findAlternativeSuggestions(
  input: FindAlternativesInput,
): AlternativeSuggestions {
  const {
    targetEquipment,
    catalog,
    user,
    requestedStartTime,
    requestedEndTime,
    bookings,
    maintenanceWindows,
    nowMs = Date.now(),
    timeZone = DEFAULT_TIMEZONE,
    maxTimeSlots = 4,
    maxEquipmentOptions = 4,
  } = input;

  const reqStartMs = Date.parse(requestedStartTime);
  const reqEndMs = Date.parse(requestedEndTime);

  const timeSlots: AlternativeTimeSlot[] = [];
  const equivalentEquipment: AlternativeEquipmentOption[] = [];

  if (Number.isNaN(reqStartMs) || Number.isNaN(reqEndMs) || reqEndMs <= reqStartMs) {
    return { timeSlots, equivalentEquipment };
  }

  const durationMs = reqEndMs - reqStartMs;

  // 1. Search alternative time slots on the same equipment (30-min increments over 4 days)
  if (!targetEquipment.archived) {
    const stepMs = 30 * 60_000;
    const searchOriginMs = Math.max(
      reqStartMs - 4 * 3_600_000,
      Math.ceil((nowMs + 15 * 60_000) / stepMs) * stepMs,
    );
    const searchHorizonMs = reqStartMs + 72 * 3_600_000;

    for (
      let candidateStart = searchOriginMs;
      candidateStart <= searchHorizonMs && timeSlots.length < maxTimeSlots;
      candidateStart += stepMs
    ) {
      if (candidateStart === reqStartMs) {
        continue;
      }
      const candidateEnd = candidateStart + durationMs;
      const startIso = new Date(candidateStart).toISOString();
      const endIso = new Date(candidateEnd).toISOString();

      const evaluation = evaluateSchedulingConstraints({
        equipment: targetEquipment,
        user,
        startTime: startIso,
        endTime: endIso,
        existingBookings: bookings,
        maintenanceWindows,
        nowMs,
        timeZone,
      });

      if (evaluation.feasible) {
        timeSlots.push({
          equipmentId: targetEquipment.id,
          equipmentName: targetEquipment.name,
          startTime: startIso,
          endTime: endIso,
          availableCapacity: evaluation.remainingCapacity,
        });
      }
    }
  }

  // 2. Search equivalent or same-category equipment with compatible tags for the exact requested slot
  const targetTags = new Set(targetEquipment.tags.map((t) => t.toLowerCase()));
  const candidateEquipments = catalog
    .filter((eq) => !eq.archived && eq.id !== targetEquipment.id)
    .map((eq) => {
      const matchingTags = eq.tags.filter((t) => targetTags.has(t.toLowerCase()));
      const sameCategory = eq.category.toLowerCase() === targetEquipment.category.toLowerCase();
      return { eq, matchingTags, sameCategory };
    })
    .filter((item) => item.sameCategory || item.matchingTags.length > 0)
    .sort((a, b) => {
      if (a.sameCategory !== b.sameCategory) {
        return a.sameCategory ? -1 : 1;
      }
      if (a.matchingTags.length !== b.matchingTags.length) {
        return b.matchingTags.length - a.matchingTags.length;
      }
      return a.eq.id.localeCompare(b.eq.id);
    });

  for (const candidate of candidateEquipments) {
    if (equivalentEquipment.length >= maxEquipmentOptions) {
      break;
    }
    const evaluation = evaluateSchedulingConstraints({
      equipment: candidate.eq,
      user,
      startTime: requestedStartTime,
      endTime: requestedEndTime,
      existingBookings: bookings,
      maintenanceWindows,
      nowMs,
      timeZone,
    });

    if (evaluation.feasible) {
      equivalentEquipment.push({
        equipmentId: candidate.eq.id,
        equipmentName: candidate.eq.name,
        department: candidate.eq.department,
        category: candidate.eq.category,
        location: candidate.eq.location,
        matchingTags: candidate.matchingTags,
        startTime: requestedStartTime,
        endTime: requestedEndTime,
        availableCapacity: evaluation.remainingCapacity,
      });
    }
  }

  return { timeSlots, equivalentEquipment };
}
