import type {
  DeviceLifecycleStatus,
  DeviceTransitionRequirement,
} from '@/types/device-registry'

const VALID_TRANSITIONS: Record<DeviceLifecycleStatus, DeviceLifecycleStatus[]> = {
  in_warehouse: ['allocated', 'decommissioned', 'lost'],
  allocated: ['shipped', 'in_warehouse'],
  shipped: ['provisioning', 'in_warehouse', 'lost'],
  provisioning: ['deployed', 'in_warehouse', 'in_repair'],
  deployed: ['in_repair', 'decommissioned', 'in_warehouse', 'lost'],
  in_repair: ['provisioning', 'deployed', 'decommissioned', 'rma', 'in_warehouse'],
  decommissioned: [],
  lost: ['in_warehouse'],
  rma: [],
}

const REQUIREMENTS: Record<DeviceLifecycleStatus, DeviceTransitionRequirement> = {
  in_warehouse: {
    requiresMerchant: false,
    requiresLocation: false,
    clearsAssignment: true,
  },
  allocated: {
    requiresMerchant: true,
    requiresLocation: false,
    clearsAssignment: false,
  },
  shipped: {
    requiresMerchant: true,
    requiresLocation: false,
    clearsAssignment: false,
  },
  provisioning: {
    requiresMerchant: true,
    requiresLocation: true,
    clearsAssignment: false,
  },
  deployed: {
    requiresMerchant: true,
    requiresLocation: true,
    clearsAssignment: false,
  },
  in_repair: {
    requiresMerchant: false,
    requiresLocation: false,
    clearsAssignment: false,
  },
  decommissioned: {
    requiresMerchant: false,
    requiresLocation: false,
    clearsAssignment: false,
  },
  lost: {
    requiresMerchant: false,
    requiresLocation: false,
    clearsAssignment: false,
  },
  rma: {
    requiresMerchant: false,
    requiresLocation: false,
    clearsAssignment: false,
  },
}

export const ALL_DEVICE_STATUSES: DeviceLifecycleStatus[] = [
  'in_warehouse',
  'allocated',
  'shipped',
  'provisioning',
  'deployed',
  'in_repair',
  'decommissioned',
  'lost',
  'rma',
]

export function getValidNextStatuses(status: DeviceLifecycleStatus) {
  return VALID_TRANSITIONS[status] ?? []
}

export function isValidTransition(
  currentStatus: DeviceLifecycleStatus,
  nextStatus: DeviceLifecycleStatus
) {
  return getValidNextStatuses(currentStatus).includes(nextStatus)
}

export function getTransitionRequirement(status: DeviceLifecycleStatus) {
  return REQUIREMENTS[status]
}
