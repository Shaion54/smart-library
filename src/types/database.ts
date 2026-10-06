export type UserRole = "student" | "admin";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Seat {
  id: string; // 'S01' | 'S02' | 'S03' | 'S04'
  seat_number: number;
  is_occupied: boolean;
  is_maintenance: boolean;
  last_occupied_change: string;
  created_at: string;
  updated_at: string;
}

export type ReservationStatus = "active" | "cancelled" | "expired" | "completed";

export interface Reservation {
  id: string;
  seat_id: string;
  user_id: string;
  status: ReservationStatus;
  start_time: string;
  end_time: string;
  cancelled_at: string | null;
  created_at: string;
  profiles?: Profile;
  seats?: Seat;
}

export interface Device {
  id: string;
  device_name: string;
  last_seen: string;
  is_online: boolean;
  noise_warning_active: boolean;
  noise_warning_updated_at: string;
  ip_address: string | null;
  firmware_version: string | null;
  created_at: string;
}

export interface NoiseLog {
  id: string;
  device_id: string;
  noise_detected: boolean;
  recorded_at: string;
  details: string | null;
}

export type SeatDisplayStatus = "Available" | "Occupied" | "Reserved" | "Maintenance" | "Offline";

export interface SeatWithStatus extends Seat {
  displayStatus: SeatDisplayStatus;
  activeReservation?: Reservation | null;
  deviceOnline: boolean;
}
