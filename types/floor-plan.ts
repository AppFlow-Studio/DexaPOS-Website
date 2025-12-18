import { TABLE_SHAPES } from "@/utils/tables/table-shapes";

export type TableStatus =
    | 'available'
    | 'reserved'
    | 'seated'
    | 'ordered'
    | 'served'
    | 'check_presented'
    | 'paid'
    | 'cleaning'
    | 'blocked'
    | 'not_in_service';

export type ObjectCategory = 'table' | 'booth' | 'functional' | 'structure' | 'decor' | 'zone';

export interface FloorPlanObject {
    id: string;
    floor_plan_id: string;
    name: string;
    shape_id: keyof typeof TABLE_SHAPES;
    category: ObjectCategory;
    x: number;
    y: number;
    rotation: number;
    width?: number;
    height?: number;
    capacity?: number;
    min_capacity?: number;
    is_reservable?: boolean;
    is_combinable?: boolean;
    default_turn_time?: number;
    section_id?: string;
    zone_name?: string;
    label_override?: string;
    color_override?: string;
    z_index: number;
    is_visible: boolean;
    is_active: boolean;
    mergedWith?: string[];
    isPrimary?: boolean;
}

export interface TableSession {
    id: string;
    session_number: string;
    status: TableStatus;
    party_size: number;
    guest_name?: string;
    guest_phone?: string;
    guest_notes?: string;
    order_id?: string;
    server_staff_id?: string;
    seated_at: string;
    current_course: number;
    needs_attention: boolean;
    is_vip: boolean;
    minutes_seated?: number;
    merged_tables?: string[];
}

export interface TableWithSession extends FloorPlanObject {
    session?: TableSession | null;
    next_reservation?: {
        id: string;
        party_name: string;
        party_size: number;
        time: string;
        status: string;
    } | null;
}


export interface FloorPlan {
    id: string;
    name: string;
    description: string | null;
    is_active: boolean;
    is_default: boolean;
    display_order: number;
    table_count: number;
    total_capacity: number;
    canvas_width?: number;
    canvas_height?: number;
    grid_size?: number;
    background_color?: string;
    objects: FloorPlanObject[];
}

export interface WaitlistEntry {
    id: string;
    party_name: string;
    party_size: number;
    phone?: string;
    status: 'waiting' | 'notified' | 'arrived' | 'seated' | 'no_show' | 'cancelled' | 'expired';
    position: number;
    quoted_wait_minutes: number;
    estimated_ready_at?: string;
    actual_wait_minutes?: number;
    preferred_section?: string;
    seating_preference?: string;
    notes?: string;
    created_at: string;
    notified_at?: string;
    minutes_waiting?: number;
}

export interface Reservation {
    id: string;
    confirmation_number: string;
    party_name: string;
    party_size: number;
    phone: string;
    email?: string;
    reservation_time: string;
    duration_minutes: number;
    end_time?: string;
    status: 'pending' | 'confirmed' | 'reminded' | 'arrived' | 'seated' | 'completed' | 'no_show' | 'cancelled';
    assigned_table_ids?: string[];
    assigned_tables?: string[];
    preferred_section?: string;
    seating_preference?: string;
    notes?: string;
    special_requests?: string;
    is_vip: boolean;
    source: string;
}

