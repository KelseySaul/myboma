export interface Building {
  id: string;
  platformId?: string;
  name: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  landlordId: string;
}

export type PropertyType = 'residential' | 'commercial' | 'bnb';
export type PropertyStatus = 'available' | 'rented' | 'booked';

export interface Property {
  id: string;
  platformId?: string;
  landlordId: string;
  buildingId?: string | null;
  unitNumber?: string | null;
  title: string;
  description: string;
  type: PropertyType;
  price: number;
  location: string;
  images: string[];
  status: PropertyStatus;
  amenities: string[];
  tenantId?: string | null;
}

export type RequestStatus = 'pending' | 'in-progress' | 'resolved';

export interface MaintenanceRequest {
  id: string;
  tenantId: string;
  propertyId: string;
  landlordId: string;
  title: string;
  description: string;
  status: RequestStatus;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  resolutionNotes?: string | null;
  updatedAt?: string | null;
  createdAt: string;
}

export interface CaretakerMember {
  uid: string;
  email: string;
  displayName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  status: 'active' | 'suspended';
  createdAt: string;
}

export interface CaretakerReport {
  id: string;
  landlordId: string;
  caretakerId: string;
  propertyId?: string | null;
  buildingId?: string | null;
  category: 'maintenance' | 'security' | 'cleanliness' | 'utility' | 'tenant_issue' | 'inspection' | 'other';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  title: string;
  description: string;
  images: string[];
  status: 'open' | 'acknowledged' | 'resolved';
  landlordNotes?: string | null;
  caretakerName?: string | null;
  caretakerEmail?: string | null;
  caretakerPhone?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RentPayment {
  id: string;
  tenantId: string;
  propertyId: string;
  landlordId: string;
  amount: number;
  status: 'paid' | 'pending' | 'overdue' | 'verifying';
  dueDate: string;
  paidAt?: string | null;
  createdAt?: string | null;
  paymentProvider?: string | null;
  paymentMetadata?: Record<string, unknown> | null;
}

export interface Booking {
  id: string;
  propertyId: string;
  startDate: string;
  endDate: string;
  totalPrice: number;
  status: 'pending' | 'confirmed' | 'cancelled';
}

export interface Expense {
  id: string;
  propertyId?: string | null;
  category: string;
  description: string;
  amount: number;
  expenseDate: string;
}

export interface Invitation {
  email: string;
  displayName?: string | null;
  phone?: string | null;
  role: string;
  landlordId: string;
  createdAt: string;
}

export interface Lease {
  id: string;
  propertyId: string;
  tenantEmail: string;
  startDate: string;
  endDate?: string | null;
  rentAmount: number;
  dueDay: number;
  depositAmount: number;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type?: string;
  read: boolean;
  createdAt: string;
}

export interface Tenant {
  email: string;
  name: string;
  phone: string;
  /** invited = has not created an account yet. */
  status: 'invited' | 'active' | 'no-unit' | 'overdue';
  hasAccount: boolean;
  units: Property[];
  lease?: Lease;
  balance: number;
  invitedAt: string;
}

export type LandlordTab = 'dashboard' | 'properties' | 'tenants' | 'caretakers' | 'pending' | 'finances' | 'maintenance' | 'automations';
