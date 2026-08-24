import { useState, useEffect, useRef, useMemo } from 'react';
import { getSubscriptionFeatures } from '../lib/landlordSubscription';
import { authClient } from '../lib/auth-client';
import {
  provisionUser,
  uploadFile,
  markRentPaymentManual,
  sendRentReminder as sendRentReminderRequest,
  getLandlordDashboard,
  syncRentInvoices,
  createBuilding,
  updateBuilding,
  deleteBuilding as deleteBuildingRequest,
  createProperties,
  updateProperty,
  deleteProperty as deletePropertyRequest,
  addPropertyManager,
  assignTenant,
  unassignTenant,
  deleteTenant as deleteTenantRequest,
  updateMaintenanceRequestStatus,
  createExpense,
  updateMyProfile,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification as deleteNotificationRequest,
} from '../lib/api';
import { logAudit } from '../lib/audit';
import { formatStatKes, normalizeRentPayment } from '../lib/rentUtils';
import { UserProfile } from '../App';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// Using FontAwesome instead of Lucide
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBuilding, faWallet, faChartLine, faBell, faFileExcel, faMoon, faSun, faHome, faTools, faUsers, faChevronDown, faChevronUp, faPlus, faMinus, faCheck, faTrash, faEdit, faSearch, faFilter, faDownload, faMapMarkerAlt, faPhone, faEnvelope, faUser, faUpload, faTimes, faImage, faChevronLeft, faChevronRight, faSpinner, faEllipsisV, faChartPie, faInfoCircle, faBolt, faBars, faCog, faSignOutAlt, faReceipt } from '@fortawesome/free-solid-svg-icons';
import { toast } from 'sonner';
import { convertToWebP } from '@/lib/image-utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { OccupancyDonutChart, RentCollectionBarChart, FinancialYieldGrid } from './AnalyticsCharts';
import { formatCurrencyFull, formatCurrencyCompact, formatNumberCompact } from '../lib/formatters';

interface Building {
  id: string;
  platformId?: string;
  name: string;
  address: string;
  landlordId: string;
}

interface Property {
  id: string;
  platformId?: string;
  landlordId: string;
  buildingId?: string;
  unitNumber?: string;
  title: string;
  description: string;
  type: 'residential' | 'commercial' | 'bnb';
  price: number;
  location: string;
  images: string[];
  status: 'available' | 'rented' | 'booked';
  amenities: string[];
  tenantId?: string; // Email or UID of the assigned tenant
}

interface MaintenanceRequest {
  id: string;
  platformId?: string;
  tenantId: string;
  propertyId: string;
  landlordId: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'resolved';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: any;
}

interface RentPayment {
  id: string;
  platformId?: string;
  tenantId: string;
  propertyId: string;
  landlordId: string;
  amount: number;
  status: 'paid' | 'pending' | 'overdue';
  dueDate: string;
  paidAt?: any;
  receiptUrl?: string;
  paymentProvider?: string;
}

interface Booking {
  id: string;
  platformId?: string;
  hunterId: string;
  propertyId: string;
  landlordId: string;
  startDate: string;
  endDate: string;
  totalPrice: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  paymentReference?: string;
  createdAt: string;
}

interface Expense {
  id: string;
  platformId?: string;
  landlordId: string;
  propertyId?: string;
  category: string;
  description: string;
  amount: number;
  expenseDate: string;
  receiptUrl?: string;
  createdAt: string;
}

interface Invitation {
  email: string;
  platformId?: string;
  displayName?: string;
  phone?: string;
  role: string;
  landlordId: string;
  createdAt: string;
}

export default function LandlordDashboard({ profile, activeTab, setActiveTab }: { profile: UserProfile; activeTab: string; setActiveTab: (tab: string) => void }) {
  const subscriptionFeatures = useMemo(
    () => getSubscriptionFeatures(profile),
    [profile.subscriptionPlan, profile.role],
  );

  useEffect(() => {
    if (!subscriptionFeatures.maintenanceHub && activeTab === 'maintenance') {
      setActiveTab('dashboard');
    }
  }, [activeTab, subscriptionFeatures.maintenanceHub, setActiveTab]);

  const [properties, setProperties] = useState<Property[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [payments, setPayments] = useState<RentPayment[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isExpenseOpen, setIsExpenseOpen] = useState(false);
  const [isCreateTenantOpen, setIsCreateTenantOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isBuildingOpen, setIsBuildingOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingTenant, setIsCreatingTenant] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [assigningTenantEmail, setAssigningTenantEmail] = useState('');
  const [selectedPropertyToAssign, setSelectedPropertyToAssign] = useState('none');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isManageAccessOpen, setIsManageAccessOpen] = useState(false);
  const [managingProperty, setManagingProperty] = useState<Property | null>(null);
  const [managerEmail, setManagerEmail] = useState('');

  const [propertyStatusFilter, setPropertyStatusFilter] = useState<string>('all');
  const [buildingFilter, setBuildingFilter] = useState<string>('all');
  const [propertySearch, setPropertySearch] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all');
  const [propertyPage, setPropertyPage] = useState(1);
  const [maintenanceSearch, setMaintenanceSearch] = useState('');
  const [maintenanceFilter, setMaintenanceFilter] = useState<'All' | 'Pending' | 'In Progress' | 'Resolved'>('All');
  const [maintenancePage, setMaintenancePage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);
  const [tenantSearch, setTenantSearch] = useState('');
  const [tenantFilter, setTenantFilter] = useState<'All' | 'Active' | 'Invited' | 'Overdue'>('All');
  const [tenantPage, setTenantPage] = useState(1);
  const [selectedTenantEmails, setSelectedTenantEmails] = useState<string[]>([]);
  const PROPERTIES_PER_PAGE = 12;

  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [landlordProfile, setLandlordProfile] = useState({
    displayName: profile.displayName || '',
    phone: profile.phone || '',
    address: profile.address || '',
    avatarUrl: profile.avatarUrl || '',
    bankName: profile.bankName || '',
    bankAccountNumber: profile.bankAccountNumber || '',
    bankAccountName: profile.bankAccountName || '',
  });

  const [newTenant, setNewTenant] = useState({
    email: '',
    displayName: '',
    phone: '',
    password: '',
  });

  const [newBuilding, setNewBuilding] = useState({
    name: '',
    address: '',
  });
  
  const [isEditBuildingOpen, setIsEditBuildingOpen] = useState(false);
  const [editBuildingForm, setEditBuildingForm] = useState({ id: '', name: '', address: '' });

  // Form state
  const [newProperty, setNewProperty] = useState({
    buildingId: 'none',
    unitNumber: '',
    title: '',
    description: '',
    type: 'residential' as const,
    price: '',
    location: '',
    amenities: '',
    images: '',
  });

  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);
  const [isAnticipatedOpen, setIsAnticipatedOpen] = useState(false);
  const [bulkAddForm, setBulkAddForm] = useState({
    buildingId: 'none',
    type: 'residential' as 'residential' | 'commercial' | 'bnb',
    price: '',
    prefix: '',
    startNumber: 1,
    count: 10,
    amenities: '',
    images: '',
  });

  const [newExpense, setNewExpense] = useState({
    propertyId: 'none',
    category: 'maintenance',
    description: '',
    amount: '',
    expenseDate: new Date().toISOString().split('T')[0],
    receiptUrl: '',
  });

  // Polls the consolidated landlord dashboard endpoint (buildings, properties, requests,
  // payments, bookings, expenses, invitations, notifications) — replaces the old seven
  // Supabase Realtime channels. The endpoint also runs the automatic rent-invoice sync
  // that used to happen client-side (see server/rentInvoiceSync.ts).
  const fetchDashboard = useRef<() => Promise<void>>(async () => {});
  fetchDashboard.current = async () => {
    try {
      const data = await getLandlordDashboard();
      setBuildings(data.buildings as Building[]);
      setProperties(data.properties as Property[]);
      setRequests(data.requests as MaintenanceRequest[]);
      setPayments(data.payments.map((row) => normalizeRentPayment(row as RentPayment)));
      setBookings(data.bookings as Booking[]);
      setExpenses(data.expenses as Expense[]);
      setInvitations(data.invitations as Invitation[]);
      setNotifications(data.notifications);
    } catch (err) {
      console.error('Landlord dashboard fetch failed:', err);
      toast.error('Could not load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard.current();
    const interval = setInterval(() => fetchDashboard.current(), 30000);
    return () => clearInterval(interval);
  }, [profile.uid]);

  const filteredProperties = properties.filter(p => {
    const matchesStatus = propertyStatusFilter === 'all' || p.status === propertyStatusFilter;
    const matchesBuilding = buildingFilter === 'all' || 
                            (buildingFilter === 'standalone' ? !p.buildingId : p.buildingId === buildingFilter);
    const matchesSearch = p.title.toLowerCase().includes(propertySearch.toLowerCase()) || 
                          (p.unitNumber && p.unitNumber.toLowerCase().includes(propertySearch.toLowerCase()));
    return matchesStatus && matchesBuilding && matchesSearch;
  });

  const totalPropertyPages = Math.ceil(filteredProperties.length / PROPERTIES_PER_PAGE);
  const paginatedProperties = filteredProperties.slice(
    (propertyPage - 1) * PROPERTIES_PER_PAGE,
    propertyPage * PROPERTIES_PER_PAGE
  );

  const filteredPayments = payments.filter(payment => {
    const property = properties.find(p => p.id === payment.propertyId);
    const tenantId = String(payment.tenantId || '').toLowerCase();
    const search = paymentSearch.toLowerCase();
    
    const matchesSearch = 
      tenantId.includes(search) ||
      (property?.title.toLowerCase().includes(search) ?? false) ||
      (property?.unitNumber?.toLowerCase().includes(search) ?? false);
    
    const matchesStatus = paymentStatusFilter === 'all' || payment.status === paymentStatusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const totalPaymentPages = Math.ceil(filteredPayments.length / 10);
  const paginatedPayments = filteredPayments.slice(
    (paymentPage - 1) * 10,
    paymentPage * 10
  );

  const filteredRequests = requests.filter(req => {
    if (maintenanceFilter !== 'All' && req.status.toLowerCase() !== maintenanceFilter.toLowerCase().replace(' ', '-')) return false;
    const prop = properties.find(p => p.id === req.propertyId);
    const search = maintenanceSearch.toLowerCase();
    return (
      req.title.toLowerCase().includes(search) ||
      req.description.toLowerCase().includes(search) ||
      req.priority.toLowerCase().includes(search) ||
      req.status.toLowerCase().includes(search) ||
      (prop?.title.toLowerCase().includes(search) ?? false) ||
      (prop?.unitNumber?.toLowerCase().includes(search) ?? false)
    );
  });
  const totalRequestPages = Math.ceil(filteredRequests.length / 10);
  const paginatedRequests = filteredRequests.slice(
    (maintenancePage - 1) * 10,
    maintenancePage * 10
  );

  const paidRentTotal = payments
    .filter(p => p.status === 'paid')
    .reduce((total, payment) => total + Number(payment.amount || 0), 0);
  const confirmedBookingTotal = bookings
    .filter(booking => booking.status === 'confirmed')
    .reduce((total, booking) => total + Number(booking.totalPrice || 0), 0);
  const expenseTotal = expenses.reduce((total, expense) => total + Number(expense.amount || 0), 0);
  const receivablesTotal = payments
    .filter(p => p.status !== 'paid')
    .reduce((total, payment) => total + Number(payment.amount || 0), 0);
  const netIncome = paidRentTotal + confirmedBookingTotal - expenseTotal;

  // Anticipated rent from all rented properties (based on current occupancy)
  const anticipatedRentTotal = properties
    .filter(p => p.status === 'rented')
    .reduce((sum, p) => sum + Number(p.price || 0), 0);

  // Rent to be collected (specifically pending or overdue payment records)
  const pendingRentPayments = payments.filter(p => p.status !== 'paid');
  const collectionLedgerTotal = pendingRentPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  // Analytics helper counts
  const overdueRentTotal = payments
    .filter(p => p.status === 'overdue')
    .reduce((total, payment) => total + Number(payment.amount || 0), 0);
  const pendingRentTotal = payments
    .filter(p => p.status === 'pending')
    .reduce((total, payment) => total + Number(payment.amount || 0), 0);

  const availableCount = properties.filter(p => p.status === 'available').length;
  const rentedCount = properties.filter(p => p.status === 'rented').length;
  const bookedCount = properties.filter(p => p.status === 'booked').length;

  const csvCell = (value: unknown) => {
    const text = String(value ?? '');
    const neutralized = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${neutralized.replace(/"/g, '""')}"`;
  };

  const downloadExcel = () => {
    const paymentData = filteredPayments.map(p => {
      const prop = properties.find(prop => prop.id === p.propertyId);
      return {
        'Property Name': prop?.title || 'Unknown',
        'Unit': prop?.unitNumber || 'N/A',
        'Tenant Email': p.tenantId,
        'Amount (KSh)': p.amount,
        'Due Date': p.dueDate,
        'Status': p.status.toUpperCase(),
        'Payment Date': p.paidAt ? new Date(p.paidAt).toLocaleDateString() : 'Pending'
      };
    });

    const headers = ['Property Name', 'Unit', 'Tenant Email', 'Amount (KSh)', 'Due Date', 'Status', 'Payment Date'];
    const csvRows = [
      headers.map(csvCell).join(','),
      ...paymentData.map(row => headers.map(header => csvCell(row[header as keyof typeof row])).join(',')),
    ];

    const blob = new Blob([csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `MyBoma_Books_${new Date().toISOString().split('T')[0]}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Books report downloaded!");
  };

  const sendRentReminder = async (payment: RentPayment) => {
    try {
      await sendRentReminderRequest(payment.id);
      toast.success(`Reminder sent successfully!`);
    } catch (error: any) {
      toast.error(error.message || "Failed to send reminder");
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const uploadedUrls: string[] = [];
    
    try {
      for (let i = 0; i < files.length; i++) {
        let file = files[i];
        file = await convertToWebP(file);
        const { url } = await uploadFile(file, `${Date.now()}-${i}.webp`);
        uploadedUrls.push(url);
      }

      if (isEditOpen && editingProperty) {
        setEditingProperty({ ...editingProperty, images: [...editingProperty.images, ...uploadedUrls] });
      } else if (isBulkAddOpen) {
        setBulkAddForm({ ...bulkAddForm, images: [...bulkAddForm.images.split(',').filter(x => x), ...uploadedUrls].join(', ') });
      } else {
        setNewProperty({ ...newProperty, images: [...newProperty.images.split(',').filter(x => x), ...uploadedUrls].join(', ') });
      }
      toast.success("Images uploaded!");
    } catch (error) {
      toast.error("Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddManager = async () => {
    if (!managingProperty || !managerEmail) return;
    try {
      await addPropertyManager(managingProperty.id, managerEmail, 'manager');
      toast.success("Manager added successfully!");
      setIsManageAccessOpen(false);
      setManagerEmail('');
      setManagingProperty(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to add manager");
    }
  };

  const handleAddBuilding = async () => {
    if (!newBuilding.name) return;
    try {
      const created = await createBuilding({ name: newBuilding.name, address: newBuilding.address });
      setBuildings(prev => [...prev, created as Building]);
      toast.success("Building added!");
      setIsBuildingOpen(false);
      setNewBuilding({ name: '', address: '' });
    } catch (error) {
      toast.error("Failed to add asset group");
    }
  };

  const handleUpdateBuilding = async () => {
    if (!editBuildingForm.name) return;
    try {
      const updated = await updateBuilding(editBuildingForm.id, {
        name: editBuildingForm.name,
        address: editBuildingForm.address,
      });
      setBuildings(prev => prev.map(b => b.id === editBuildingForm.id ? (updated as Building) : b));
      toast.success("Asset updated!");
      setIsEditBuildingOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to update asset");
    }
  };

  const handleDeleteBuilding = async (id: string) => {
    if (!confirm("Are you sure you want to delete this asset group? Any standalone units inside will become unassigned.")) return;
    try {
      await deleteBuildingRequest(id);
      setBuildings(prev => prev.filter(b => b.id !== id));
      toast.success("Asset deleted successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete asset");
    }
  };

  const canAddListings = (additional = 1) => {
    if (subscriptionFeatures.maxListings == null) return true;
    return properties.length + additional <= subscriptionFeatures.maxListings;
  };

  const handleAddProperty = async () => {
    if (!canAddListings(1)) {
      toast.error(
        `Your ${subscriptionFeatures.label} plan allows up to ${subscriptionFeatures.maxListings} listings. Upgrade to add more.`,
      );
      return;
    }
    try {
      const created = await createProperties([{
        buildingId: newProperty.buildingId === 'none' ? null : newProperty.buildingId,
        unitNumber: newProperty.unitNumber,
        title: newProperty.title,
        description: newProperty.description,
        type: newProperty.type,
        price: Number(newProperty.price),
        location: newProperty.location,
        amenities: newProperty.amenities.split(',').map(a => a.trim()).filter(a => a),
        images: newProperty.images.split(',').map(url => url.trim()).filter(url => url),
      }]);
      setProperties(prev => [...prev, ...(created as Property[])]);
      toast.success("Property added!");
      setIsAddOpen(false);
      setNewProperty({ buildingId: 'none', unitNumber: '', title: '', description: '', type: 'residential', price: '', location: '', amenities: '', images: '' });
    } catch (error) {
      toast.error("Failed to add property");
    }
  };

  const handleBulkAddProperties = async () => {
    if (bulkAddForm.buildingId === 'none') {
      toast.error('Please select a building');
      return;
    }
    const building = buildings.find(b => b.id === bulkAddForm.buildingId);
    if (!building) return;

    if (!canAddListings(bulkAddForm.count)) {
      toast.error(
        `Your ${subscriptionFeatures.label} plan allows up to ${subscriptionFeatures.maxListings} listings. Reduce batch size or upgrade.`,
      );
      return;
    }

    try {
      const inserts = [];
      for (let i = 0; i < bulkAddForm.count; i++) {
        const unitNum = `${bulkAddForm.prefix}${Number(bulkAddForm.startNumber) + i}`;
        inserts.push({
          buildingId: bulkAddForm.buildingId,
          unitNumber: unitNum,
          title: `${building.name} - ${unitNum}`,
          description: `Bulk created ${bulkAddForm.type} unit in ${building.name}.`,
          type: bulkAddForm.type,
          price: Number(bulkAddForm.price),
          location: building.address,
          amenities: bulkAddForm.amenities.split(',').map(a => a.trim()).filter(a => a),
          images: bulkAddForm.images.split(',').map(url => url.trim()).filter(url => url),
        });
      }
      const created = await createProperties(inserts);
      setProperties(prev => [...prev, ...(created as Property[])]);

      toast.success(`Successfully created ${bulkAddForm.count} units!`);
      setIsBulkAddOpen(false);
      setBulkAddForm({ buildingId: 'none', type: 'residential', price: '', prefix: '', startNumber: 1, count: 10, amenities: '', images: '' });
    } catch (error) {
      toast.error('Failed to create units in bulk');
    }
  };

  const refreshLandlordPayments = () => fetchDashboard.current();

  const handleRecordExpense = async () => {
    try {
      const created = await createExpense({
        propertyId: newExpense.propertyId === 'none' ? null : newExpense.propertyId,
        category: newExpense.category,
        description: newExpense.description,
        amount: Number(newExpense.amount),
        expenseDate: newExpense.expenseDate,
        receiptUrl: newExpense.receiptUrl || null,
      });
      setExpenses(prev => [created as Expense, ...prev]);
      toast.success("Expense recorded!");
      setIsExpenseOpen(false);
      setNewExpense({ propertyId: 'none', category: 'maintenance', description: '', amount: '', expenseDate: new Date().toISOString().split('T')[0], receiptUrl: '' });
    } catch (error) {
      toast.error("Failed to record expense");
    }
  };

  const handleDeleteProperty = async (id: string) => {
    if (!confirm("Delete property?")) return;
    try {
      await deletePropertyRequest(id);
      setProperties(prev => prev.filter(p => p.id !== id));
      toast.success("Deleted");
    } catch (error) {
      toast.error("Failed");
    }
  };

  const handleEditProperty = (property: Property) => {
    setEditingProperty(property);
    setIsEditOpen(true);
  };

  const handleUpdateProperty = async () => {
    if (!editingProperty) return;
    try {
      const { id, ...data } = editingProperty;
      const updated = await updateProperty(id, data);
      setProperties(prev => prev.map(p => p.id === id ? (updated as Property) : p));

      if (data.status === 'rented' && data.tenantId) {
        await refreshLandlordPayments();
      }

      toast.success("Updated");
      setIsEditOpen(false);
    } catch (error) {
      toast.error("Failed");
    }
  };

  const handleUpdateProfile = async () => {
    try {
      await updateMyProfile(landlordProfile);
      toast.success("Profile updated");
      setIsProfileOpen(false);
    } catch (error) {
      toast.error("Failed");
    }
  };

  const handleLogout = async () => {
    await authClient.signOut({});
    toast.success('Signed out');
  };

  // File storage is still on Supabase pending the Cloudflare R2 migration (Phase 6).
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const convertedFile = await convertToWebP(file);
      const { url } = await uploadFile(convertedFile, `avatar-${Date.now()}.webp`, 'avatar');
      setLandlordProfile({ ...landlordProfile, avatarUrl: url });
    } catch (error) {
      toast.error("Failed to upload profile picture");
    } finally {
      setIsUploading(false);
    }
  };

  const handleMarkAsPaid = async (paymentId: string) => {
    try {
      await markRentPaymentManual(paymentId, 'Landlord marked as paid (cash/manual)');

      // Update local state for immediate feedback
      setPayments((prev) =>
        prev.map((p) =>
          p.id === paymentId
            ? normalizeRentPayment({
                ...p,
                status: 'paid',
                paidAt: new Date().toISOString(),
                paymentProvider: 'manual',
              })
            : p,
        ),
      );

      logAudit('PAYMENT_MARK_PAID', 'rentPayment', paymentId, { provider: 'manual' });
      toast.success('Marked as paid (manual)');

      // After marking paid, sync to ensure next month's invoice is ready
      await syncRentInvoices();
      await refreshLandlordPayments();
    } catch (error: any) {
      toast.error(error.message || 'Failed to mark payment. Is the API server running (npm run dev)?');
    }
  };

  const handleCreateTenant = async () => {
    if (isCreatingTenant) return;
    setIsCreatingTenant(true);
    try {
      const result = await provisionUser({
        email: newTenant.email.toLowerCase(),
        password: newTenant.password,
        displayName: newTenant.displayName,
        phone: newTenant.phone,
        role: 'tenant',
        platformId: profile.platformId,
        landlordId: profile.uid,
        mustChangePassword: true,
      });

      logAudit('TENANT_INVITE', 'user', newTenant.email.toLowerCase());
      toast.success("Tenant created!");
      
      // Update state immediately from the server result
      if (result.invitation) {
        setInvitations(prev => {
          const exists = prev.some(i => i.email.toLowerCase() === result.email.toLowerCase());
          if (exists) {
            return prev.map(i => i.email.toLowerCase() === result.email.toLowerCase() ? result.invitation : i);
          }
          return [...prev, result.invitation];
        });
      }

      setIsCreateTenantOpen(false);
      setNewTenant({ email: '', displayName: '', phone: '', password: '' });
    } catch (error: any) {
      toast.error(error.message || "Failed to create tenant");
    } finally {
      setIsCreatingTenant(false);
    }
  };

  const handleAssignTenant = async () => {
    try {
      const selectedProp = properties.find(p => p.id === selectedPropertyToAssign);
      if (!selectedProp) return;

      const tenantEmail = assigningTenantEmail.toLowerCase();
      // The server assigns the property and generates the first invoice (pending, with a
      // 30-day grace period) in one step — see /landlord/tenants/assign.
      const { property: updated } = await assignTenant(selectedProp.id, tenantEmail);
      setProperties(prev => prev.map(p => p.id === updated.id ? (updated as Property) : p));
      await refreshLandlordPayments();

      toast.success('Tenant assigned — first rent invoice generated');
      setIsAssignDialogOpen(false);
    } catch (error) {
      console.error("Assign tenant error:", error);
      toast.error("Failed to assign tenant");
    }
  };

  const handleUnassignTenant = async (email: string) => {
    if (!confirm(`Unassign all properties from ${email} and cancel unpaid invoices?`)) return;
    try {
      const normalizedEmail = email.toLowerCase();
      await unassignTenant(normalizedEmail);

      // Update local state immediately
      setProperties(prev => prev.map(p =>
        p.tenantId?.toLowerCase() === normalizedEmail
          ? { ...p, tenantId: null, status: 'available' as const }
          : p
      ));
      setPayments(prev => prev.filter(p =>
        p.tenantId?.toLowerCase() !== normalizedEmail || p.status === 'paid'
      ));

      toast.success("Properties unassigned & unpaid invoices cleared");
    } catch (error) {
      toast.error("Failed to unassign properties");
    }
  };

  const handleDeleteTenant = async (email: string) => {
    if (!confirm("Delete tenant, unassign from all units, and cancel unpaid invoices?")) return;
    try {
      const normalizedEmail = email.toLowerCase();
      await deleteTenantRequest(normalizedEmail);

      // Update local state immediately
      setInvitations(prev => prev.filter(i => i.email.toLowerCase() !== normalizedEmail));
      setProperties(prev => prev.map(p =>
        p.tenantId?.toLowerCase() === normalizedEmail
          ? { ...p, tenantId: null, status: 'available' as const }
          : p
      ));
      setPayments(prev => prev.filter(p =>
        p.tenantId?.toLowerCase() !== normalizedEmail || p.status === 'paid'
      ));

      toast.success("Tenant removed & unpaid invoices cleared");
    } catch (error) {
      console.error("Delete tenant error:", error);
      toast.error("Failed to remove tenant");
    }
  };

  const handleBulkDeleteTenants = async () => {
    if (!confirm(`Delete ${selectedTenantEmails.length} tenants, unassign from all units, and cancel unpaid invoices?`)) return;
    try {
      for (const email of selectedTenantEmails) {
        await deleteTenantRequest(email.toLowerCase());
      }

      const normalizedEmails = selectedTenantEmails.map(e => e.toLowerCase());
      setInvitations(prev => prev.filter(i => !normalizedEmails.includes(i.email.toLowerCase())));
      setProperties(prev => prev.map(p => 
        p.tenantId && normalizedEmails.includes(p.tenantId.toLowerCase()) 
          ? { ...p, tenantId: null, status: 'available' as const } 
          : p
      ));
      setPayments(prev => prev.filter(p => 
        !p.tenantId || !normalizedEmails.includes(p.tenantId.toLowerCase()) || p.status === 'paid'
      ));

      toast.success(`${selectedTenantEmails.length} tenants removed & unpaid invoices cleared`);
      setSelectedTenantEmails([]);
    } catch (error) {
      console.error("Bulk delete tenant error:", error);
      toast.error("Failed to remove some tenants");
    }
  };

  const handleBulkExportTenants = () => {
    const selectedTenants = tenantList.filter(t => selectedTenantEmails.includes(t.email));
    const csvContent = [
      ['Email', 'Display Name', 'Phone', 'Status', 'Assigned Properties'].join(','),
      ...selectedTenants.map(t => [
        t.email, 
        t.displayName, 
        t.phone, 
        t.status, 
        (t.assignedProperties || []).map((p: any) => p.title).join(';')
      ].join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tenants_export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${selectedTenantEmails.length} tenants exported.`);
    setSelectedTenantEmails([]);
  };

  const toggleTenantSelection = (email: string) => {
    setSelectedTenantEmails(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]);
  };

  const toggleAllTenants = () => {
    if (selectedTenantEmails.length === paginatedTenants.length && paginatedTenants.length > 0) {
      setSelectedTenantEmails([]);
    } else {
      setSelectedTenantEmails(paginatedTenants.map((t: any) => t.email));
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      toast.success('Marked as read');
    } catch (err: any) {
      console.error('Error marking read:', err);
      toast.error('Failed to mark notification as read');
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      toast.success('All notifications marked as read');
    } catch (err: any) {
      console.error('Error marking all read:', err);
      toast.error('Failed to mark all as read');
    }
  };

  // Preserves the original behavior: supabase-setup.sql never granted a DELETE policy
  // on notifications to anyone but the service role, so this always 403s for a
  // non-super-admin landlord (see the /notifications/:id DELETE route in app.ts).
  const handleDeleteNotification = async (id: string) => {
    try {
      await deleteNotificationRequest(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      toast.success('Notification deleted');
    } catch (err: any) {
      console.error('Error deleting notification:', err);
      toast.error('Failed to delete notification');
    }
  };

  const handleNotifyRent = async (email: string) => {
    toast.success("Notification queued");
  };

  const updateRequestStatus = async (id: string, status: string) => {
    try {
      await updateMaintenanceRequestStatus(id, status as 'pending' | 'in-progress' | 'resolved');
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: status as MaintenanceRequest['status'] } : r));
      toast.success("Updated");
    } catch (error) {
      toast.error("Failed");
    }
  };

  const tenantList = (() => {
    const list: any[] = [];
    invitations.forEach(inv => {
      const assigned = properties.filter(p => p.tenantId?.toLowerCase() === inv.email.toLowerCase()).map(p => ({ id: p.id, title: p.title, unitNumber: p.unitNumber }));
      const hasOverdue = payments.some(p => p.status === 'overdue' && assigned.some(prop => prop.id === p.propertyId));
      list.push({ email: inv.email, displayName: inv.displayName || '', phone: inv.phone || '', status: hasOverdue ? 'overdue' : assigned.length > 0 ? 'active' : 'invited', assignedProperties: assigned });
    });
    return list;
  })();

  const filteredTenants = tenantList.filter(t => {
    if (tenantFilter !== 'All' && t.status.toLowerCase() !== tenantFilter.toLowerCase()) return false;
    const search = tenantSearch.toLowerCase();
    return (
      t.displayName.toLowerCase().includes(search) ||
      t.email.toLowerCase().includes(search) ||
      t.phone.toLowerCase().includes(search) ||
      t.status.toLowerCase().includes(search) ||
      t.assignedProperties.some((p: any) => p.title.toLowerCase().includes(search) || p.unitNumber?.toLowerCase().includes(search))
    );
  });

  const totalTenantPages = Math.ceil(filteredTenants.length / 10);
  const paginatedTenants = filteredTenants.slice(
    (tenantPage - 1) * 10,
    tenantPage * 10
  );

  return (
    <div className="db pb-24 sm:pb-8 animate-in fade-in duration-700">
      <div className="pt-2 sm:pt-6 px-6 sm:px-8 mb-4 animate-in fade-in slide-in-from-bottom-2 flex justify-between items-start">
        <div>
          <div className="text-zinc-500 text-sm font-medium mb-1">Welcome back, {profile.displayName?.split(' ')[0] || 'User'}</div>
          <h1 className="text-3xl sm:text-4xl font-black text-zinc-900 dark:text-white tracking-tight capitalize">
            {activeTab === 'dashboard' || !activeTab ? 'Overview' : 
             activeTab === 'properties' ? 'Units' : 
             activeTab === 'finances' ? 'Finance' : 
             activeTab === 'maintenance' ? 'Repairs' : 
             activeTab === 'automations' ? 'Notifications' : 
             activeTab}
          </h1>
          {activeTab === 'tenants' && (
            <div className="text-zinc-500 font-medium text-sm mt-1">
              {tenantList.filter(t => t.status === 'active').length} active · {tenantList.filter(t => t.status === 'invited').length} invited · {properties.filter(p => p.status === 'available').length} vacant units
            </div>
          )}
          {activeTab === 'properties' && (
            <div className="text-zinc-500 font-medium text-sm mt-1">
              {properties.length} total units · {properties.filter(p => p.status === 'available').length} vacant
            </div>
          )}
        </div>
        
        {activeTab !== 'tenants' && activeTab !== 'settings' && (
          <div className="hidden sm:block">
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button size="sm" className="hidden sm:flex items-center gap-2 shadow-sm rounded-lg">
                  <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" /> 
                  <span>Create New</span>
                </Button>
              } />
              <DropdownMenuContent align="end" className="w-56 p-2 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-900">
              <DropdownMenuItem onClick={() => setIsAddOpen(true)} className="cursor-pointer rounded-xl p-3 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <FontAwesomeIcon icon={faHome} className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-zinc-900 dark:text-white">New Asset</div>
                  <div className="text-[10px] text-zinc-500">List a single property</div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsBulkAddOpen(true)} className="cursor-pointer rounded-xl p-3 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <FontAwesomeIcon icon={faTools} className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-zinc-900 dark:text-white">Bulk Add Units</div>
                  <div className="text-[10px] text-zinc-500">Create multiple units</div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-100 dark:bg-zinc-800 mx-2" />
              <DropdownMenuItem onClick={() => setIsCreateTenantOpen(true)} className="cursor-pointer rounded-xl p-3 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                <div className="h-8 w-8 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                  <FontAwesomeIcon icon={faUsers} className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-zinc-900 dark:text-white">Add Tenant</div>
                  <div className="text-[10px] text-zinc-500">Invite a new tenant</div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsBuildingOpen(true)} className="cursor-pointer rounded-xl p-3 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                <div className="h-8 w-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <FontAwesomeIcon icon={faBuilding} className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-zinc-900 dark:text-white">Add Building</div>
                  <div className="text-[10px] text-zinc-500">Group your units</div>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        )}
      </div>

      <div className="px-6 mt-6">
        {/* ── Dashboard Overview ─────────────────────── */}
        {(activeTab === 'dashboard' || !activeTab) && (
          <div className="mt-4 space-y-6 animate-in fade-in duration-500">
            {/* Quick stats row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="col-span-2 md:col-span-1 lg:col-span-1 bg-primary rounded-xl p-5 flex flex-col justify-center gap-2 shadow-sm text-primary-foreground">
                <div className="flex items-center justify-between text-primary-foreground/80">
                  <p className="text-[10px] font-bold uppercase tracking-wider">Subscription</p>
                  <FontAwesomeIcon icon={faBolt} className="h-3 w-3" />
                </div>
                <p className="text-xl font-bold leading-tight">{subscriptionFeatures.label}</p>
                <p className="text-[10px] font-medium text-primary-foreground/70">
                  {profile.subscriptionExpiresAt 
                    ? `Active until ${new Date(profile.subscriptionExpiresAt).toLocaleDateString()}` 
                    : 'Prepaid Plan'}
                </p>
              </div>

              <StatCard
                title="Total Units"
                value={properties.length}
                description={`${properties.filter(p => p.status === 'available').length} available`}
                icon={<FontAwesomeIcon icon={faHome} className="text-blue-500" />}
              />
              
              <StatCard
                title="Listings Limit"
                value={`${properties.length} / ${subscriptionFeatures.maxListings ?? '∞'}`}
                description="Units Capacity"
                icon={<FontAwesomeIcon icon={faChartPie} className="text-purple-500" />}
              />
              
              <StatCard
                title="Revenue (Paid)"
                value={formatCurrencyCompact(payments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount || 0), 0))}
                description={`${payments.filter(p => p.status === 'pending' || p.status === 'overdue').length} pending`}
                icon={<FontAwesomeIcon icon={faWallet} className="text-amber-500" />}
              />
              
              <StatCard
                title="Maintenance"
                value={requests.filter(r => r.status !== 'resolved').length}
                description={`${requests.filter(r => r.status === 'resolved').length} resolved`}
                icon={<FontAwesomeIcon icon={faTools} className="text-destructive" />}
              />
            </div>

            {/* Recent payments + Maintenance split */}
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Recent payments */}
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-50 flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Recent Payments</p>
                  <button
                    onClick={() => setActiveTab('finances')}
                    className="text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-zinc-900 transition-colors"
                  >
                    View All →
                  </button>
                </div>
                <div className="divide-y divide-zinc-50">
                  {payments.slice(0, 5).map(pay => (
                    <div key={pay.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-[10px] font-black text-zinc-900 truncate max-w-[140px]">
                          {properties.find(p => p.id === pay.propertyId)?.title || 'Property'}
                        </p>
                        <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                          {new Date(pay.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-black text-zinc-900 tabular-nums">KES {pay.amount?.toLocaleString()}</p>
                        <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                          pay.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                          pay.status === 'overdue' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                        }`}>{pay.status}</span>
                      </div>
                    </div>
                  ))}
                  {payments.length === 0 && (
                    <EmptyState
                      icon={<FontAwesomeIcon icon={faWallet} className="h-6 w-6" />}
                      title="No payments yet"
                      description="You haven't received any payments. When a tenant pays, it will show up here."
                      className="border-0 shadow-none my-4"
                    />
                  )}
                </div>
              </div>

              {subscriptionFeatures.maintenanceHub ? (
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-50 flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Maintenance Queue</p>
                  <button
                    onClick={() => setActiveTab('maintenance')}
                    className="text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-zinc-900 transition-colors"
                  >
                    View All →
                  </button>
                </div>
                <div className="divide-y divide-zinc-50">
                  {requests.slice(0, 5).map(req => (
                    <div key={req.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-[10px] font-black text-zinc-900 truncate max-w-[140px]">{req.title}</p>
                        <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                          {req.priority} priority
                        </p>
                      </div>
                      <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                        req.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' :
                        req.status === 'in-progress' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                      }`}>{req.status}</span>
                    </div>
                  ))}
                  {requests.length === 0 && (
                    <EmptyState
                      icon={<FontAwesomeIcon icon={faTools} className="h-6 w-6" />}
                      title="No maintenance requests"
                      description="All clear! Your properties are in good shape."
                      className="border-0 shadow-none my-4"
                    />
                  )}
                </div>
              </div>
              ) : (
                <EmptyState
                  icon={<FontAwesomeIcon icon={faTools} className="h-6 w-6" />}
                  title="Maintenance Hub"
                  description="Upgrade your plan to unlock the maintenance ticketing system."
                  action={{
                    label: 'Upgrade Plan',
                    onClick: () => setActiveTab('settings')
                  }}
                  className="h-full border border-dashed border-zinc-200 bg-zinc-50"
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'properties' && (
          <div className="mt-4 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500 px-6">
            {/* Header section removed to fix duplicate titles */}

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Rented</span>
                <span className="text-2xl font-black text-zinc-900 dark:text-white">{properties.filter(p => p.status === 'rented').length}</span>
              </div>
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Vacant</span>
                <span className="text-2xl font-black text-zinc-900 dark:text-white">{properties.filter(p => p.status === 'available').length}</span>
              </div>
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Monthly</span>
                <span className="text-2xl font-black text-zinc-900 dark:text-white">
                  {(() => {
                    const inc = properties.filter(p => p.status === 'rented').reduce((acc, p) => acc + p.price, 0);
                    return inc >= 1000 ? `${Math.floor(inc/1000)}k` : inc;
                  })()}
                </span>
              </div>
            </div>

            {/* Search and Add Button */}
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input placeholder="Search units" className="pl-8 h-10 bg-background" value={propertySearch} onChange={(e) => { setPropertySearch(e.target.value); setPropertyPage(1); }} />
              </div>
              <Button onClick={() => properties.length === 0 ? setIsBuildingOpen(true) : setIsAddOpen(true)} className="h-10 shrink-0 shadow-sm rounded-lg flex items-center">
                <FontAwesomeIcon icon={faPlus} className="mr-2 h-3.5 w-3.5" />
                <span className="hidden sm:inline">{properties.length === 0 ? 'Add property' : 'Add unit'}</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </div>

            {/* Filter chips */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-6 px-6 sm:mx-0 sm:px-0">
              {['All', 'Rented', 'Vacant', ...buildings.map(b => b.name)].map(f => {
                const isActive = (f === 'All' && buildingFilter === 'all' && propertyStatusFilter === 'all') ||
                                 (f === 'Rented' && propertyStatusFilter === 'rented') ||
                                 (f === 'Vacant' && propertyStatusFilter === 'available') ||
                                 (buildings.find(b => b.id === buildingFilter)?.name === f);
                
                return (
                  <button 
                    key={f}
                    onClick={() => {
                       if (f === 'All') { setBuildingFilter('all'); setPropertyStatusFilter('all'); }
                       else if (f === 'Rented') { setBuildingFilter('all'); setPropertyStatusFilter('rented'); }
                       else if (f === 'Vacant') { setBuildingFilter('all'); setPropertyStatusFilter('available'); }
                       else { setBuildingFilter(buildings.find(b => b.name === f)?.id || 'all'); setPropertyStatusFilter('all'); }
                       setPropertyPage(1);
                    }}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold border shrink-0 transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm' 
                        : 'bg-background border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
            
            <div className="space-y-8">
              {(() => {
                const groupedMap = new Map<string, any[]>();
                buildings.forEach(b => groupedMap.set(b.id, []));
                paginatedProperties.forEach(property => {
                  const bId = property.buildingId || 'standalone';
                  if (!groupedMap.has(bId)) groupedMap.set(bId, []);
                  groupedMap.get(bId)!.push(property);
                });
                return Array.from(groupedMap.entries()).map(([bId, props]) => {
                  if (buildingFilter !== 'all' && buildingFilter !== bId && !(buildingFilter === 'standalone' && bId === 'standalone')) return null;
                  const bName = bId === 'standalone' ? 'Standalone Assets' : buildings.find(b => b.id === bId)?.name || 'Unknown Building';
                  if (bId === 'standalone' && props.length === 0) return null;
                  if (props.length === 0 && propertySearch && !bName.toLowerCase().includes(propertySearch.toLowerCase())) return null;
                  if (props.length === 0) return null;

                  return (
                    <div key={bId} className="space-y-3">
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-zinc-500 px-1">
                        <div>{bName}</div>
                        <div>{props.length} unit{props.length !== 1 ? 's' : ''}</div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {props.map(property => {
                          const tenant = tenantList.find(t => t.assignedProperties?.some((ap: any) => ap.id === property.id));
                          return (
                            <PropertyCard 
                              key={property.id} 
                              property={property} 
                              profile={profile} 
                              onEdit={handleEditProperty} 
                              onDelete={handleDeleteProperty} 
                              onManageAccess={(p) => {
                                setManagingProperty(p);
                                setIsManageAccessOpen(true);
                              }}
                              buildingName={bName !== 'Standalone Assets' ? bName : undefined}
                              tenantName={tenant?.displayName}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
              {paginatedProperties.length === 0 && (
                <EmptyState
                  icon={<FontAwesomeIcon icon={faHome} className="h-6 w-6" />}
                  title="No properties found"
                  description={propertySearch ? "Try adjusting your search or filters." : "You haven't added any units yet."}
                  action={!propertySearch ? {
                    label: 'Add Property',
                    onClick: () => setIsAddOpen(true)
                  } : undefined}
                />
              )}
            </div>

            {totalPropertyPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8 pb-8">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  disabled={propertyPage === 1}
                  onClick={() => setPropertyPage(p => p - 1)}
                  className="rounded-xl font-black uppercase tracking-widest text-[9px]"
                >
                  <FontAwesomeIcon icon={faChevronLeft} className="mr-2" /> Prev
                </Button>
                <div className="flex items-center gap-1">
                  {[...Array(totalPropertyPages)].map((_, i) => (
                    <Button
                      key={i}
                      variant={propertyPage === i + 1 ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setPropertyPage(i + 1)}
                      className={`h-8 w-8 rounded-lg font-black text-[9px] ${propertyPage === i + 1 ? 'bg-zinc-950 text-white' : 'text-zinc-500'}`}
                    >
                      {i + 1}
                    </Button>
                  ))}
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  disabled={propertyPage === totalPropertyPages}
                  onClick={() => setPropertyPage(p => p + 1)}
                  className="rounded-xl font-black uppercase tracking-widest text-[9px]"
                >
                  Next <FontAwesomeIcon icon={faChevronRight} className="ml-2" />
                </Button>
              </div>
            )}

            {paginatedProperties.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                <div className="h-20 w-20 rounded-[2rem] bg-indigo-50/50 flex items-center justify-center text-indigo-300">
                  <FontAwesomeIcon icon={faBuilding} className="h-10 w-10 text-indigo-400" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-black text-zinc-900">Your portfolio is empty</h3>
                  <p className="text-sm font-medium text-zinc-500 max-w-sm mx-auto">
                    Start by adding a building to group your units, or list a standalone property to begin collecting rent.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button className="btn-primary text-xs" onClick={() => setIsAddOpen(true)}>
                    <FontAwesomeIcon icon={faHome} className="mr-2" /> New Asset
                  </button>
                  <button className="btn-ghost text-xs" onClick={() => setIsBuildingOpen(true)}>
                    <FontAwesomeIcon icon={faBuilding} className="mr-2" /> Add Building
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'maintenance' && !subscriptionFeatures.maintenanceHub && (
          <div className="mt-8 rounded-2xl border border-amber-100 bg-amber-50 p-8 text-center">
            <p className="text-lg font-black text-zinc-900">Maintenance hub unavailable</p>
            <p className="mt-2 text-sm font-medium text-zinc-600">
              Your {subscriptionFeatures.label} plan does not include maintenance. Upgrade to Growth or Pro in subscription settings.
            </p>
          </div>
        )}

        {activeTab === 'maintenance' && subscriptionFeatures.maintenanceHub && (
          <div className="px-6 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Header section */}
            <div>
              <h2 className="text-2xl font-black text-zinc-900 dark:text-white mb-1">Repairs</h2>
              <div className="text-sm text-zinc-500">
                {requests.length} total tickets · {requests.filter(r => r.status === 'pending').length} pending review
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Pending</span>
                <span className="text-2xl font-black text-amber-500">{requests.filter(r => r.status === 'pending').length}</span>
              </div>
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Fixing</span>
                <span className="text-2xl font-black text-blue-500">{requests.filter(r => r.status === 'in-progress').length}</span>
              </div>
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Resolved</span>
                <span className="text-2xl font-black text-emerald-500">{requests.filter(r => r.status === 'resolved').length}</span>
              </div>
            </div>

            {/* Search and Action Button */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-400" />
                <Input 
                  placeholder="Search tickets..." 
                  className="pl-8 h-12 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 rounded-xl text-sm shadow-sm" 
                  value={maintenanceSearch} 
                  onChange={(e) => { setMaintenanceSearch(e.target.value); setMaintenancePage(1); }} 
                />
              </div>
            </div>

            {/* Filter chips */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 -mx-6 px-6 sm:mx-0 sm:px-0">
              {['All', 'Pending', 'In Progress', 'Resolved'].map(f => (
                <button 
                  key={f}
                  onClick={() => { setMaintenanceFilter(f as any); setMaintenancePage(1); }}
                  className={`whitespace-nowrap px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${maintenanceFilter === f ? 'bg-zinc-900 text-white dark:bg-white dark:text-black shadow-md' : 'bg-white dark:bg-zinc-900 text-zinc-500 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'}`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Cards List */}
            <div className="space-y-4">
              {paginatedRequests.map((req) => {
                const prop = properties.find(p => p.id === req.propertyId);
                return (
                  <div key={req.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm flex flex-col gap-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                          req.status === 'resolved' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' :
                          req.status === 'in-progress' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
                        }`}>
                          <FontAwesomeIcon icon={faTools} className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-black text-sm text-zinc-900 dark:text-white line-clamp-1">{req.title}</div>
                          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">
                            {prop?.title || 'Unknown Unit'} {prop?.unitNumber ? `· ${prop.unitNumber}` : ''}
                          </div>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={
                          <button className="h-8 w-8 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center text-zinc-400 transition-colors shrink-0 ml-2">
                            <FontAwesomeIcon icon={faEllipsisV} className="h-3 w-3" />
                          </button>
                        } />
                        <DropdownMenuContent align="end" className="w-48 p-2 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-900">
                          <DropdownMenuItem onClick={() => updateRequestStatus(req.id, 'pending')} className="cursor-pointer rounded-xl p-2.5 text-xs font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800">
                            <div className="h-2 w-2 rounded-full bg-amber-500 mr-2" /> Mark Pending
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateRequestStatus(req.id, 'in-progress')} className="cursor-pointer rounded-xl p-2.5 text-xs font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800">
                            <div className="h-2 w-2 rounded-full bg-blue-500 mr-2" /> Mark In Progress
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateRequestStatus(req.id, 'resolved')} className="cursor-pointer rounded-xl p-2.5 text-xs font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800">
                            <div className="h-2 w-2 rounded-full bg-emerald-500 mr-2" /> Mark Resolved
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3">
                      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300 line-clamp-2">{req.description}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3">
                        <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Priority</div>
                        <div className={`text-xs font-black capitalize ${req.priority === 'urgent' ? 'text-rose-600' : 'text-zinc-700 dark:text-zinc-200'}`}>
                          {req.priority}
                        </div>
                      </div>
                      <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3">
                        <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Status</div>
                        <div className={`text-xs font-black capitalize ${
                          req.status === 'resolved' ? 'text-emerald-600' :
                          req.status === 'in-progress' ? 'text-blue-600' : 'text-amber-600'
                        }`}>
                          {req.status.replace('-', ' ')}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {paginatedRequests.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                  <div className="h-16 w-16 rounded-[2rem] bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
                    <FontAwesomeIcon icon={faCheck} className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-black text-zinc-900 dark:text-white">All caught up</h3>
                    <p className="text-xs font-medium text-zinc-500">No maintenance tickets match your criteria.</p>
                  </div>
                </div>
              )}
            </div>

            {totalRequestPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8 pb-8">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  disabled={maintenancePage === 1}
                  onClick={() => setMaintenancePage(p => p - 1)}
                  className="rounded-xl font-black uppercase tracking-widest text-[9px]"
                >
                  <FontAwesomeIcon icon={faChevronLeft} className="mr-2" /> Prev
                </Button>
                <div className="flex items-center gap-1">
                  {[...Array(totalRequestPages)].map((_, i) => (
                    <Button
                      key={i}
                      variant={maintenancePage === i + 1 ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setMaintenancePage(i + 1)}
                      className={`h-8 w-8 rounded-lg font-black text-[9px] ${maintenancePage === i + 1 ? 'bg-zinc-950 text-white' : 'text-zinc-500'}`}
                    >
                      {i + 1}
                    </Button>
                  ))}
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  disabled={maintenancePage === totalRequestPages}
                  onClick={() => setMaintenancePage(p => p + 1)}
                  className="rounded-xl font-black uppercase tracking-widest text-[9px]"
                >
                  Next <FontAwesomeIcon icon={faChevronRight} className="ml-2" />
                </Button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'finances' && (
          <div className="px-6 pb-24 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Header section */}
            <div>
              <div className="text-sm text-muted-foreground">
                {netIncome === 0 ? 'Break-even' : `${formatCurrencyFull(netIncome)} Net Profit`} · {payments.length} total transaction(s)
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div onClick={() => setIsAnticipatedOpen(true)} className="cursor-pointer">
                <StatCard
                  title="Expected Rent"
                  value={formatCurrencyCompact(anticipatedRentTotal)}
                  icon={<FontAwesomeIcon icon={faChartLine} className="text-blue-500" />}
                  className="hover:bg-muted/50 transition-colors h-full"
                />
              </div>
              
              <StatCard
                title="Collected"
                value={formatCurrencyCompact(paidRentTotal)}
                icon={<FontAwesomeIcon icon={faWallet} className="text-emerald-500" />}
              />
              
              <StatCard
                title="Operating Costs"
                value={formatCurrencyCompact(expenseTotal)}
                icon={<FontAwesomeIcon icon={faChartPie} className="text-amber-500" />}
              />
              
              <StatCard
                title="Net Performance"
                value={formatCurrencyCompact(netIncome)}
                icon={<FontAwesomeIcon icon={faChartLine} className="text-rose-500" />}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <OccupancyDonutChart data={{ available: availableCount, rented: rentedCount, booked: bookedCount }} />
              <RentCollectionBarChart data={{ collected: paidRentTotal, pending: pendingRentTotal, overdue: overdueRentTotal }} />
            </div>

            {/* Search and Action Buttons */}
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input placeholder="Search ledger..." className="pl-8 h-10 bg-background" value={paymentSearch} onChange={(e) => { setPaymentSearch(e.target.value); setPaymentPage(1); }} />
              </div>
              <Button variant="outline" size="sm" onClick={downloadExcel} className="h-10 shrink-0 shadow-sm rounded-lg">
                <FontAwesomeIcon icon={faFileExcel} className="mr-2 hidden sm:inline" /> 
                <span>Export</span>
              </Button>
              <Button size="sm" onClick={() => setIsExpenseOpen(true)} className="h-10 shrink-0 shadow-sm rounded-lg">
                <FontAwesomeIcon icon={faChartPie} className="mr-2 hidden sm:inline" /> 
                <span>Expense</span>
              </Button>
            </div>

            {/* Filter chips */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-6 px-6 sm:mx-0 sm:px-0">
              {['All', 'Paid', 'Pending', 'Overdue'].map(f => (
                <button 
                  key={f}
                  onClick={() => { setPaymentStatusFilter(f.toLowerCase()); setPaymentPage(1); }}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold border shrink-0 transition-colors ${
                    (f.toLowerCase() === paymentStatusFilter)
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm' 
                      : 'bg-background border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Ledger Cards */}
            <div className="space-y-3">
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Ledger Transactions</h3>
              {paginatedPayments.length === 0 ? (
                <EmptyState
                  icon={<FontAwesomeIcon icon={faReceipt} className="h-6 w-6" />}
                  title={`No ${paymentStatusFilter !== 'all' ? paymentStatusFilter : ''} transactions`}
                  description="Transactions matching your criteria will appear here."
                  className="my-4"
                />
              ) : (
                paginatedPayments.map((payment) => {
                  const prop = properties.find(p => p.id === payment.propertyId);
                  const tenant = tenantList.find(t => t.email === payment.tenantId);
                  return (
                    <div key={payment.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col gap-3 shadow-sm group">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-10 w-10 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 flex items-center justify-center shrink-0 border border-zinc-200 dark:border-zinc-700">
                            <FontAwesomeIcon icon={faReceipt} className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-bold text-zinc-900 dark:text-white truncate">{prop?.title || 'Unknown Asset'}</span>
                              {payment.status === 'paid' && <Badge className="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20 h-4 px-1.5 text-[8px] uppercase tracking-wider font-black">Paid</Badge>}
                              {payment.status === 'overdue' && <Badge className="bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 border-rose-100 dark:border-rose-500/20 h-4 px-1.5 text-[8px] uppercase tracking-wider font-black">Overdue</Badge>}
                              {payment.status === 'pending' && <Badge className="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 border-amber-100 dark:border-amber-500/20 h-4 px-1.5 text-[8px] uppercase tracking-wider font-black">Pending</Badge>}
                            </div>
                            <div className="text-xs text-zinc-500 truncate">{prop?.unitNumber ? `Unit ${prop.unitNumber}` : prop?.location || 'N/A'}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <div className="text-sm font-black text-zinc-900 dark:text-white tabular-nums">KES {Number(payment.amount).toLocaleString()}</div>
                            <div className="text-[10px] font-medium text-zinc-400">{payment.dueDate || 'No Date'}</div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger render={
                              <button className="h-8 w-8 rounded-lg text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center justify-center shrink-0 transition-colors -mr-2">
                                <FontAwesomeIcon icon={faEllipsisV} />
                              </button>
                            } />
                            <DropdownMenuContent align="end" className="w-48 p-2 rounded-2xl border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-900">
                              {payment.status !== 'paid' && (
                                <>
                                  <DropdownMenuItem className="cursor-pointer rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800" onClick={() => sendRentReminder(payment)}>
                                    <FontAwesomeIcon icon={faBell} className="mr-2 text-zinc-400 w-4 text-center" /> Remind Tenant
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="cursor-pointer rounded-xl px-3 py-2.5 text-xs font-bold text-emerald-600 dark:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10" onClick={() => handleMarkAsPaid(payment.id)}>
                                    <FontAwesomeIcon icon={faCheck} className="mr-2 text-emerald-500 w-4 text-center" /> Mark as Paid
                                  </DropdownMenuItem>
                                </>
                              )}
                              {payment.status === 'paid' && (
                                <DropdownMenuItem className="cursor-pointer rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800" onClick={() => {}}>
                                  <FontAwesomeIcon icon={faDownload} className="mr-2 text-zinc-400 w-4 text-center" /> Download Receipt
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 bg-zinc-50 dark:bg-zinc-950 rounded-xl p-3 border border-zinc-100 dark:border-zinc-800/50 mt-1">
                        <div>
                          <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Tenant Name</div>
                          <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300 truncate">{tenant?.displayName || payment.tenantId || 'Unknown'}</div>
                        </div>
                        <div>
                          <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Transaction Type</div>
                          <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300 truncate">Rent Collection</div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            
            {/* Pagination */}
            {totalPaymentPages > 1 && (
              <div className="flex items-center justify-between pt-4 px-2">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Page {paymentPage} of {totalPaymentPages}</span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setPaymentPage(p => Math.max(1, p - 1))} disabled={paymentPage === 1} className="h-8 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><FontAwesomeIcon icon={faChevronLeft} className="mr-2" /> Prev</Button>
                  <Button variant="ghost" size="sm" onClick={() => setPaymentPage(p => Math.min(totalPaymentPages, p + 1))} disabled={paymentPage === totalPaymentPages} className="h-8 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">Next <FontAwesomeIcon icon={faChevronRight} className="ml-2" /></Button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'tenants' && (
          <div className="px-6 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Header section */}
            <div>
              <h2 className="text-2xl font-black text-zinc-900 dark:text-white mb-1">Tenants</h2>
              <div className="text-sm text-zinc-500">
                {tenantList.length} total tenant(s) · {tenantList.length > 0 ? Math.round((tenantList.filter(t => t.status === 'active').length / tenantList.length) * 100) : 0}% active
              </div>
            </div>

            {/* 3 Metric Tiles */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 flex flex-col justify-between border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Active</span>
                <span className="text-2xl font-black text-zinc-900 dark:text-white">{tenantList.filter(t => t.status === 'active').length}</span>
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 flex flex-col justify-between border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Invited</span>
                <span className="text-2xl font-black text-zinc-900 dark:text-white">{tenantList.filter(t => t.status === 'invited').length}</span>
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 flex flex-col justify-between border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Overdue</span>
                <span className="text-2xl font-black text-rose-500 dark:text-rose-400">{tenantList.filter(t => t.status === 'overdue').length}</span>
              </div>
            </div>

            {/* Search and Add Button */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-400" />
                <Input placeholder="Search tenants" className="pl-8 h-12 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 rounded-xl text-sm shadow-sm" value={tenantSearch} onChange={(e) => { setTenantSearch(e.target.value); setTenantPage(1); }} />
              </div>
              <Button onClick={() => setIsCreateTenantOpen(true)} className="h-12 px-4 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200 shrink-0 font-bold shadow-sm">
                <FontAwesomeIcon icon={faPlus} className="mr-2" /> Invite
              </Button>
            </div>

            {/* Filter chips */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 -mx-6 px-6 sm:mx-0 sm:px-0">
              {['All', 'Active', 'Invited', 'Overdue'].map(f => (
                <button 
                  key={f}
                  onClick={() => { setTenantFilter(f as any); setTenantPage(1); }}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold border shrink-0 transition-colors ${
                    tenantFilter === f 
                      ? 'bg-zinc-900 dark:bg-white text-white dark:text-black border-zinc-900 dark:border-white shadow-sm' 
                      : 'bg-white dark:bg-transparent border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Tenant Cards */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {paginatedTenants.length === 0 ? (
                <div className="sm:col-span-2 lg:col-span-3 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-3">
                  <div className="h-10 w-10 flex items-center justify-center">
                    <FontAwesomeIcon icon={faUsers} className="h-6 w-6 text-zinc-400" />
                  </div>
                  <p className="text-zinc-500 text-sm font-medium">No {tenantFilter !== 'All' ? tenantFilter.toLowerCase() : 'invited'} tenants yet. Tap <span className="font-bold text-zinc-900 dark:text-white">Invite</span> to add one.</p>
                </div>
              ) : (
                paginatedTenants.map((tenant) => (
                  <div key={tenant.email} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col gap-3 shadow-sm group">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 flex items-center justify-center shrink-0 border border-zinc-200 dark:border-zinc-700">
                          <span className="font-black text-sm">{tenant.displayName?.charAt(0).toUpperCase() || 'U'}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-bold text-zinc-900 dark:text-white truncate">{tenant.displayName || 'No Name'}</span>
                            {tenant.status === 'active' && <Badge className="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20 h-4 px-1.5 text-[8px] uppercase tracking-wider font-black">Active</Badge>}
                            {tenant.status === 'overdue' && <Badge className="bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 border-rose-100 dark:border-rose-500/20 h-4 px-1.5 text-[8px] uppercase tracking-wider font-black">Overdue</Badge>}
                            {tenant.status === 'invited' && <Badge className="bg-zinc-50 text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 h-4 px-1.5 text-[8px] uppercase tracking-wider font-black">Invited</Badge>}
                          </div>
                          <div className="text-xs text-zinc-500 truncate">{tenant.email}</div>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={
                          <button className="h-8 w-8 rounded-lg text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center justify-center shrink-0 transition-colors -mr-2">
                            <FontAwesomeIcon icon={faEllipsisV} />
                          </button>
                        } />
                        <DropdownMenuContent align="end" className="w-56 p-2 rounded-2xl border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-900">
                          <DropdownMenuItem className="cursor-pointer rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800" onClick={() => { setAssigningTenantEmail(tenant.email); setIsAssignDialogOpen(true); }}>
                            <FontAwesomeIcon icon={faPlus} className="mr-2 text-zinc-400 w-4 text-center" /> Assign Asset
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800" onClick={() => handleUnassignTenant(tenant.email)}>
                            <FontAwesomeIcon icon={faMinus} className="mr-2 text-zinc-400 w-4 text-center" /> Unassign Asset
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer rounded-xl px-3 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10" onClick={() => handleDeleteTenant(tenant.email)}>
                            <FontAwesomeIcon icon={faTrash} className="mr-2 text-rose-500 w-4 text-center" /> Delete Tenant
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-zinc-50 dark:bg-zinc-950 rounded-xl p-3 border border-zinc-100 dark:border-zinc-800/50 mt-1">
                      <div>
                        <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Phone</div>
                        <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300 truncate">{tenant.phone || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Assigned Units</div>
                        <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300 truncate">
                          {tenant.assignedProperties?.length > 0 
                            ? tenant.assignedProperties.map((p: any) => `${buildings.find(b => b.id === properties.find(prop => prop.id === p.id)?.buildingId)?.name || 'Standalone'} ${p.unitNumber}`).join(', ')
                            : 'None'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {/* Pagination */}
            {totalTenantPages > 1 && (
              <div className="flex items-center justify-between pt-4 px-2">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Page {tenantPage} of {totalTenantPages}</span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setTenantPage(p => Math.max(1, p - 1))} disabled={tenantPage === 1} className="h-8 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><FontAwesomeIcon icon={faChevronLeft} className="mr-2" /> Prev</Button>
                  <Button variant="ghost" size="sm" onClick={() => setTenantPage(p => Math.min(totalTenantPages, p + 1))} disabled={tenantPage === totalTenantPages} className="h-8 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">Next <FontAwesomeIcon icon={faChevronRight} className="ml-2" /></Button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'automations' && (
          <div className="px-6 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Header section */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-zinc-900 dark:text-white mb-1">Notifications</h2>
                <div className="text-sm text-zinc-500">
                  {notifications.length} total messages · {notifications.filter(n => !n.read).length} unread
                </div>
              </div>
              {notifications.some(n => !n.read) && (
                <Button
                  onClick={handleMarkAllAsRead}
                  className="h-10 px-4 rounded-xl text-xs font-black uppercase tracking-wider bg-zinc-900 text-white dark:bg-white dark:text-black hover:bg-zinc-800 shrink-0"
                >
                  <FontAwesomeIcon icon={faCheck} className="mr-2" /> Mark All Read
                </Button>
              )}
            </div>

            {/* Content */}
            <div className="space-y-3">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-4 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl">
                  <div className="h-16 w-16 rounded-[2rem] bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-center text-zinc-300 dark:text-zinc-600 mb-4">
                    <FontAwesomeIcon icon={faBell} className="h-6 w-6" />
                  </div>
                  <h3 className="text-base font-black text-zinc-900 dark:text-white">All Caught Up!</h3>
                  <p className="text-xs font-medium text-zinc-500 max-w-sm mt-1">You have no new notifications.</p>
                </div>
              ) : (
                notifications.map((notif) => {
                  let icon = faBell;
                  let iconColor = 'text-zinc-500 dark:text-zinc-400';
                  let iconBg = 'bg-zinc-100 dark:bg-zinc-800';

                  if (notif.type === 'booking' || notif.type?.includes('booking')) {
                    icon = faBuilding;
                    iconColor = 'text-indigo-600 dark:text-indigo-400';
                    iconBg = 'bg-indigo-50 dark:bg-indigo-900/20';
                  } else if (notif.type === 'maintenance' || notif.type?.includes('maintenance')) {
                    icon = faTools;
                    iconColor = 'text-amber-600 dark:text-amber-400';
                    iconBg = 'bg-amber-50 dark:bg-amber-900/20';
                  } else if (notif.type === 'payment' || notif.type?.includes('payment') || notif.type?.includes('rent')) {
                    icon = faWallet;
                    iconColor = 'text-emerald-600 dark:text-emerald-400';
                    iconBg = 'bg-emerald-50 dark:bg-emerald-900/20';
                  } else if (notif.type === 'urgent' || notif.type === 'alert') {
                    icon = faBolt;
                    iconColor = 'text-rose-600 dark:text-rose-400';
                    iconBg = 'bg-rose-50 dark:bg-rose-900/20';
                  }

                  return (
                    <div
                      key={notif.id}
                      className={`flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-2xl border transition-all duration-150 ${
                        notif.read
                          ? 'border-zinc-100 bg-white dark:border-zinc-800 dark:bg-zinc-900 opacity-75'
                          : 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900 shadow-sm'
                      }`}
                    >
                      <div className="flex items-start gap-4 flex-1">
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}>
                          <FontAwesomeIcon icon={icon} className="h-4 w-4" />
                        </div>

                        <div className="flex-1 min-w-0 pr-4">
                          <div className="flex items-center gap-2">
                            <h4 className={`text-sm tracking-tight ${notif.read ? 'font-bold text-zinc-700 dark:text-zinc-300' : 'font-black text-zinc-900 dark:text-white'}`}>
                              {notif.title}
                            </h4>
                            {!notif.read && (
                              <span className="h-2 w-2 rounded-full bg-zinc-900 dark:bg-white" />
                            )}
                          </div>
                          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed break-words">
                            {notif.message}
                          </p>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-2 block">
                            {new Date(notif.createdAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 sm:self-center self-end mt-2 sm:mt-0">
                        {!notif.read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMarkAsRead(notif.id)}
                            className="h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            Mark Read
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteNotification(notif.id)}
                          className="h-8 w-8 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                          title="Delete notification"
                        >
                          <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent className="sm:max-w-[450px] p-6 rounded-3xl border-none bg-white dark:bg-zinc-900 shadow-2xl">
          <DialogHeader><DialogTitle className="text-xl font-black">Assign Tenant</DialogTitle><DialogDescription>Select property for {assigningTenantEmail}.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-6">
            <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Select Property</label>
             <Select value={selectedPropertyToAssign} onValueChange={setSelectedPropertyToAssign}>
               <SelectTrigger className="h-12 rounded-2xl border-zinc-200">
                 <SelectValue placeholder="Choose">
                   {(() => {
                     const matched = properties.find(p => p.id === selectedPropertyToAssign);
                     return matched ? `${matched.title} (KSh ${matched.price})` : undefined;
                   })()}
                 </SelectValue>
               </SelectTrigger>
               <SelectContent>{properties.filter(p => !p.tenantId).map(p => <SelectItem key={p.id} value={p.id}>{p.title} (KSh {p.price})</SelectItem>)}</SelectContent>
             </Select>
          </div>
          <DialogFooter className="flex gap-2"><Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>Cancel</Button><Button onClick={handleAssignTenant} className="bg-blue-600 text-white">Confirm</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isBulkAddOpen} onOpenChange={setIsBulkAddOpen}>
        <DialogContent className="sm:max-w-[500px] p-6 rounded-3xl border-none bg-white dark:bg-zinc-900 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Bulk Add Units</DialogTitle>
            <DialogDescription className="font-medium text-zinc-500">Rapidly generate multiple units for a building.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Building</label>
              <Select value={bulkAddForm.buildingId} onValueChange={(val) => setBulkAddForm({ ...bulkAddForm, buildingId: val })}>
                <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Select building" /></SelectTrigger>
                <SelectContent>{buildings.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Unit Type</label>
                <Select value={bulkAddForm.type} onValueChange={(val: any) => setBulkAddForm({ ...bulkAddForm, type: val })}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="residential">Apartment (Residential)</SelectItem>
                    <SelectItem value="commercial">Office (Commercial)</SelectItem>
                    <SelectItem value="bnb">Hotel Room (BNB)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Monthly/Nightly Price</label>
                <Input type="number" className="h-12 rounded-xl" value={bulkAddForm.price} onChange={e => setBulkAddForm({...bulkAddForm, price: e.target.value})} placeholder="e.g. 50000" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Prefix</label>
                <Input className="h-12 rounded-xl" value={bulkAddForm.prefix} onChange={e => setBulkAddForm({...bulkAddForm, prefix: e.target.value})} placeholder="A-" />
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Start No.</label>
                <Input type="number" className="h-12 rounded-xl" value={bulkAddForm.startNumber} onChange={e => setBulkAddForm({...bulkAddForm, startNumber: parseInt(e.target.value) || 1})} placeholder="101" />
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Count</label>
                <Input type="number" className="h-12 rounded-xl" value={bulkAddForm.count} onChange={e => setBulkAddForm({...bulkAddForm, count: parseInt(e.target.value) || 10})} placeholder="10" />
              </div>
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Amenities (comma separated)</label>
              <Input className="h-12 rounded-xl" value={bulkAddForm.amenities} onChange={e => setBulkAddForm({...bulkAddForm, amenities: e.target.value})} placeholder="e.g. WiFi, Desk, AC" />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Global Image(s)</label>
              <Input type="file" multiple accept="image/*" onChange={handleImageUpload} disabled={isUploading} className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
              {isUploading && <p className="text-xs text-blue-500 font-bold mt-1">Uploading images...</p>}
              {bulkAddForm.images && <p className="text-[10px] text-zinc-500 font-bold">{bulkAddForm.images.split(',').filter(x => x).length} images attached</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsBulkAddOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkAddProperties} disabled={isUploading} className="bg-zinc-950 text-white hover:bg-zinc-800">Generate {bulkAddForm.count} Units</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isBuildingOpen} onOpenChange={setIsBuildingOpen}>
        <DialogContent className="rounded-3xl border-none shadow-2xl bg-white dark:bg-zinc-900">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Add New Asset Group</DialogTitle>
            <DialogDescription className="font-medium text-zinc-500">Group multiple units together for easier management.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Asset Name *</label>
              <Input className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800" value={newBuilding.name} onChange={e => setNewBuilding({...newBuilding, name: e.target.value})} placeholder="e.g. Sunset Apartments" />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Address / Location</label>
              <Input className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800" value={newBuilding.address} onChange={e => setNewBuilding({...newBuilding, address: e.target.value})} placeholder="123 Sunset Blvd" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="font-bold rounded-xl h-12" onClick={() => setIsBuildingOpen(false)}>Cancel</Button>
            <Button className="font-black rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-900 h-12 px-6" onClick={handleAddBuilding}>Add Asset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditBuildingOpen} onOpenChange={setIsEditBuildingOpen}>
        <DialogContent className="rounded-3xl border-none shadow-2xl bg-white dark:bg-zinc-900">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Edit Asset Group</DialogTitle>
            <DialogDescription className="font-medium text-zinc-500">Update the name or address of this asset group.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Asset Name *</label>
              <Input className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800" value={editBuildingForm.name} onChange={e => setEditBuildingForm({...editBuildingForm, name: e.target.value})} placeholder="e.g. Sunset Apartments" />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Address / Location</label>
              <Input className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800" value={editBuildingForm.address} onChange={e => setEditBuildingForm({...editBuildingForm, address: e.target.value})} placeholder="123 Sunset Blvd" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="font-bold rounded-xl h-12" onClick={() => setIsEditBuildingOpen(false)}>Cancel</Button>
            <Button className="font-black rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-900 h-12 px-6" onClick={handleUpdateBuilding}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateTenantOpen} onOpenChange={setIsCreateTenantOpen}>
        <DialogContent className="sm:max-w-[450px] p-6 rounded-3xl border-none bg-white dark:bg-zinc-900 shadow-2xl">
          <DialogHeader><DialogTitle className="text-xl font-black">Invite Tenant</DialogTitle><DialogDescription>Create a tenant profile and send an invite.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Full Name</label>
              <Input className="h-12 rounded-xl" value={newTenant.displayName} onChange={e => setNewTenant({...newTenant, displayName: e.target.value})} placeholder="e.g. John Doe" />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Email Address</label>
              <Input type="email" className="h-12 rounded-xl" value={newTenant.email} onChange={e => setNewTenant({...newTenant, email: e.target.value})} placeholder="e.g. john@example.com" />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Phone</label>
              <Input className="h-12 rounded-xl" value={newTenant.phone} onChange={e => setNewTenant({...newTenant, phone: e.target.value})} placeholder="e.g. 0712345678" />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Initial Password</label>
              <Input type="password" className="h-12 rounded-xl" value={newTenant.password} onChange={e => setNewTenant({...newTenant, password: e.target.value})} placeholder="Set a temporary password" />
              <p className="text-[10px] text-zinc-400 font-bold ml-1">Must be at least 8 characters.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCreateTenantOpen(false)} disabled={isCreatingTenant}>Cancel</Button>
            <Button onClick={handleCreateTenant} className="bg-zinc-950 text-white hover:bg-zinc-800" disabled={isCreatingTenant}>
              {isCreatingTenant ? (
                <span className="flex items-center gap-2">
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Creating...
                </span>
              ) : 'Create Tenant'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto p-6 rounded-3xl border-none bg-white dark:bg-zinc-900 shadow-2xl">
          <DialogHeader><DialogTitle className="text-xl font-black">Add New Asset</DialogTitle><DialogDescription>Add a standalone property or a unit in a building.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Assign to Building (Optional)</label>
              <Select value={newProperty.buildingId} onValueChange={(val) => setNewProperty({ ...newProperty, buildingId: val })}>
                <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Standalone Asset)</SelectItem>
                  {buildings.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Asset Title</label>
                <Input className="h-12 rounded-xl" value={newProperty.title} onChange={e => setNewProperty({...newProperty, title: e.target.value})} placeholder="e.g. Ocean View" />
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Unit No. (Optional)</label>
                <Input className="h-12 rounded-xl" value={newProperty.unitNumber} onChange={e => setNewProperty({...newProperty, unitNumber: e.target.value})} placeholder="e.g. B-4" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Type</label>
                <Select value={newProperty.type} onValueChange={(val: any) => setNewProperty({ ...newProperty, type: val })}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="residential">Residential</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="bnb">BNB/Hotel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Price</label>
                <Input type="number" className="h-12 rounded-xl" value={newProperty.price} onChange={e => setNewProperty({...newProperty, price: e.target.value})} placeholder="e.g. 50000" />
              </div>
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Location / Address</label>
              <Input className="h-12 rounded-xl" value={newProperty.location} onChange={e => setNewProperty({...newProperty, location: e.target.value})} placeholder="e.g. Westlands" />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Description</label>
              <Textarea className="rounded-xl" value={newProperty.description} onChange={e => setNewProperty({...newProperty, description: e.target.value})} placeholder="Describe the property..." />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Amenities (comma separated)</label>
              <Input className="h-12 rounded-xl" value={newProperty.amenities} onChange={e => setNewProperty({...newProperty, amenities: e.target.value})} placeholder="e.g. Pool, Gym, WiFi" />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Images</label>
              <Input type="file" multiple accept="image/*" ref={fileInputRef} onChange={handleImageUpload} disabled={isUploading} className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
              {isUploading && <p className="text-xs text-blue-500 font-bold mt-1">Uploading images...</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddProperty} className="bg-zinc-950 text-white hover:bg-zinc-800" disabled={isUploading}>Add Asset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto p-6 rounded-3xl border-none bg-white dark:bg-zinc-900 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Edit Asset</DialogTitle>
            <DialogDescription>Modify details for this property.</DialogDescription>
          </DialogHeader>
          {editingProperty && (
            <div className="grid gap-4 py-4">
              {/* Assign to Building */}
              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Assign to Building (Optional)</label>
                <Select value={editingProperty.buildingId || 'none'} onValueChange={(val) => editingProperty && setEditingProperty({ ...editingProperty, buildingId: val === 'none' ? undefined : val })}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Standalone Asset)</SelectItem>
                    {buildings.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Title & Unit Number */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Asset Title</label>
                  <Input className="h-12 rounded-xl" value={editingProperty.title} onChange={e => editingProperty && setEditingProperty({...editingProperty, title: e.target.value})} placeholder="e.g. Ocean View" />
                </div>
                <div className="grid gap-2">
                  <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Unit No. (Optional)</label>
                  <Input className="h-12 rounded-xl" value={editingProperty.unitNumber || ''} onChange={e => editingProperty && setEditingProperty({...editingProperty, unitNumber: e.target.value})} placeholder="e.g. B-4" />
                </div>
              </div>

              {/* Type & Price */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Type</label>
                  <Select value={editingProperty.type} onValueChange={(val: any) => editingProperty && setEditingProperty({ ...editingProperty, type: val })}>
                    <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="residential">Residential</SelectItem>
                      <SelectItem value="commercial">Commercial</SelectItem>
                      <SelectItem value="bnb">BNB/Hotel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Price (KES)</label>
                  <Input type="number" className="h-12 rounded-xl" value={editingProperty.price} onChange={e => editingProperty && setEditingProperty({...editingProperty, price: parseFloat(e.target.value) || 0})} placeholder="e.g. 50000" />
                </div>
              </div>

              {/* Status */}
              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Status</label>
                <Select value={editingProperty.status} onValueChange={(val: any) => editingProperty && setEditingProperty({ ...editingProperty, status: val })}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="rented">Rented (Assigned to Tenant)</SelectItem>
                    <SelectItem value="booked">Booked (BNB)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Tenant Assignment (shown only when rented status is chosen) */}
              {editingProperty.status === 'rented' && (
                <div className="grid gap-2">
                  <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Assign Tenant (Email Address)</label>
                  <Input className="h-12 rounded-xl" value={editingProperty.tenantId || ''} onChange={e => editingProperty && setEditingProperty({...editingProperty, tenantId: e.target.value})} placeholder="tenant@example.com" />
                  <p className="text-[10px] text-zinc-400 font-bold ml-1">Must be an existing tenant's email address.</p>
                </div>
              )}

              {/* Location */}
              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Location / Address</label>
                <Input className="h-12 rounded-xl" value={editingProperty.location} onChange={e => editingProperty && setEditingProperty({...editingProperty, location: e.target.value})} placeholder="e.g. Westlands" />
              </div>

              {/* Description */}
              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Description</label>
                <Textarea className="rounded-xl" value={editingProperty.description || ''} onChange={e => editingProperty && setEditingProperty({...editingProperty, description: e.target.value})} placeholder="Describe the property..." />
              </div>

              {/* Amenities */}
              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Amenities (comma separated)</label>
                <Input className="h-12 rounded-xl" value={editingProperty.amenities?.join(', ') || ''} onChange={e => editingProperty && setEditingProperty({...editingProperty, amenities: e.target.value.split(',').map(a => a.trim()).filter(a => a)})} placeholder="e.g. Pool, Gym, WiFi" />
              </div>

              {/* Existing Images Gallery */}
              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Images Gallery</label>
                {editingProperty.images && editingProperty.images.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2 mt-1 max-h-[200px] overflow-y-auto p-1 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
                    {editingProperty.images.map((url, idx) => (
                      <div key={idx} className="relative aspect-video rounded-lg overflow-hidden group/img border border-zinc-200 dark:border-zinc-700">
                        <img src={url} alt={`Asset image ${idx}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          className="absolute inset-0 bg-black/60 flex items-center justify-center text-white opacity-0 group-hover/img:opacity-100 transition-opacity"
                          onClick={() => {
                            if (editingProperty) {
                              const updatedImages = editingProperty.images.filter((_, i) => i !== idx);
                              setEditingProperty({ ...editingProperty, images: updatedImages });
                            }
                          }}
                        >
                          <FontAwesomeIcon icon={faTrash} className="h-4 w-4 text-rose-500 hover:scale-110 transition-transform" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 italic">No images uploaded for this asset yet.</p>
                )}
              </div>

              {/* Upload New Images */}
              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Upload New Image(s)</label>
                <Input type="file" multiple accept="image/*" ref={fileInputRef} onChange={handleImageUpload} disabled={isUploading} className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                {isUploading && <p className="text-xs text-blue-500 font-bold mt-1 animate-pulse">Uploading images...</p>}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateProperty} className="bg-zinc-950 text-white hover:bg-zinc-800" disabled={isUploading}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isExpenseOpen} onOpenChange={setIsExpenseOpen}>
        <DialogContent className="sm:max-w-[450px] p-6 rounded-3xl border-none bg-white dark:bg-zinc-900 shadow-2xl">
          <DialogHeader><DialogTitle className="text-xl font-black">Record Expense</DialogTitle><DialogDescription>Log operating costs for your portfolio.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Property (Optional)</label>
              <Select value={newExpense.propertyId} onValueChange={(val) => setNewExpense({ ...newExpense, propertyId: val })}>
                <SelectTrigger className="h-12 rounded-xl">
                  <SelectValue placeholder="General Expense">
                    {newExpense.propertyId === 'none' ? 'General (No specific property)' : properties.find(p => p.id === newExpense.propertyId)?.title}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General (No specific property)</SelectItem>
                  {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Category</label>
                <Select value={newExpense.category} onValueChange={(val: any) => setNewExpense({ ...newExpense, category: val })}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="utilities">Utilities</SelectItem>
                    <SelectItem value="salary">Salary</SelectItem>
                    <SelectItem value="taxes">Taxes</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Amount (KES)</label>
                <Input type="number" className="h-12 rounded-xl" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: e.target.value})} placeholder="0" />
              </div>
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Date</label>
              <Input type="date" className="h-12 rounded-xl" value={newExpense.expenseDate} onChange={e => setNewExpense({...newExpense, expenseDate: e.target.value})} />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Description</label>
              <Textarea className="rounded-xl" value={newExpense.description} onChange={e => setNewExpense({...newExpense, description: e.target.value})} placeholder="Details of the expense..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsExpenseOpen(false)}>Cancel</Button>
            <Button onClick={handleRecordExpense} className="bg-zinc-950 text-white hover:bg-zinc-800">Record Expense</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Profile Settings Dialog */}
      <Dialog open={isProfileOpen} onOpenChange={setIsProfileOpen}>
        <DialogContent className="sm:max-w-[450px] p-6 rounded-3xl border-none bg-white dark:bg-zinc-900 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">Account Settings</DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 py-2">
            <div className="flex flex-col items-center gap-4">
              <div className="relative h-24 w-24 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 border-4 border-white dark:border-zinc-900 shadow-lg">
                <img src={landlordProfile.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.uid}`} alt="Profile" className="h-full w-full object-cover" />
                <label className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 hover:opacity-100 cursor-pointer transition-opacity">
                  <FontAwesomeIcon icon={faEdit} />
                  <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={isUploading} />
                </label>
              </div>
              {isUploading && <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 animate-pulse">Uploading...</p>}
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Display Name</label>
              <Input className="h-12 rounded-xl" value={landlordProfile.displayName} onChange={e => setLandlordProfile({...landlordProfile, displayName: e.target.value})} />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Phone</label>
              <Input className="h-12 rounded-xl" value={landlordProfile.phone} onChange={e => setLandlordProfile({...landlordProfile, phone: e.target.value})} />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Address</label>
              <Textarea className="rounded-xl" value={landlordProfile.address} onChange={e => setLandlordProfile({...landlordProfile, address: e.target.value})} />
            </div>
            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 mt-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-4">Payout Settings (Bank)</p>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Bank Name</label>
                  <Input className="h-12 rounded-xl" value={landlordProfile.bankName} onChange={e => setLandlordProfile({...landlordProfile, bankName: e.target.value})} placeholder="e.g. Equity Bank" />
                </div>
                <div className="grid gap-2">
                  <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Account Name</label>
                  <Input className="h-12 rounded-xl" value={landlordProfile.bankAccountName} onChange={e => setLandlordProfile({...landlordProfile, bankAccountName: e.target.value})} placeholder="e.g. John Doe Rentals" />
                </div>
                <div className="grid gap-2">
                  <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Account Number</label>
                  <Input className="h-12 rounded-xl" value={landlordProfile.bankAccountNumber} onChange={e => setLandlordProfile({...landlordProfile, bankAccountNumber: e.target.value})} placeholder="e.g. 0123456789" />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl font-bold" onClick={() => setIsProfileOpen(false)}>Cancel</Button>
            <Button className="h-10 px-8 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-black" onClick={handleUpdateProfile}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isAnticipatedOpen} onOpenChange={setIsAnticipatedOpen}>
        <DialogContent className="sm:max-w-[850px] p-0 rounded-3xl border-none bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">
          <div className="bg-zinc-950 p-6 text-white">
            <DialogTitle className="text-xl font-black uppercase tracking-tight">Revenue & Collection Ledger</DialogTitle>
            <DialogDescription className="text-zinc-400 font-medium">Invoices are created automatically each month. Use Mark Paid on the ledger when rent is received.</DialogDescription>
          </div>
          <div className="p-6">
            <div className="max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-100 dark:border-zinc-800">
                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-zinc-400">House/Unit</TableHead>
                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-zinc-400">Tenant</TableHead>
                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-zinc-400">Monthly Price</TableHead>
                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-zinc-400">Collection Status</TableHead>
                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-zinc-400 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {properties.filter(p => p.status === 'rented').map((prop) => {
                    const propertyPayments = payments
                      .filter((pay) => pay.propertyId === prop.id)
                      .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
                    const activePayment = propertyPayments.find((pay) => pay.status !== 'paid');
                    const latestPaid = propertyPayments.find((pay) => pay.status === 'paid');
                    return (
                      <TableRow key={prop.id} className="border-zinc-50 dark:border-zinc-800">
                        <TableCell>
                          <div className="font-bold text-sm text-zinc-900 dark:text-white">{prop.title}</div>
                          <div className="text-[10px] text-zinc-400 font-medium">{prop.unitNumber ? `Unit ${prop.unitNumber}` : prop.location}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-black text-zinc-700 dark:text-zinc-300">{prop.tenantId || 'Unassigned'}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-black text-sm tabular-nums">KES {Number(prop.price).toLocaleString()}</div>
                        </TableCell>
                        <TableCell>
                          {activePayment ? (
                            <Badge className={`px-2 py-0.5 font-black text-[8px] uppercase tracking-widest border-none ${activePayment.status === 'overdue' ? 'bg-rose-500/10 text-rose-600' : 'bg-amber-500/10 text-amber-600'}`}>
                              {activePayment.status}: Due {activePayment.dueDate}
                            </Badge>
                          ) : latestPaid ? (
                            <Badge className="px-2 py-0.5 font-black text-[8px] uppercase tracking-widest border-none bg-emerald-500/10 text-emerald-600">
                              Paid {latestPaid.paidAt ? new Date(latestPaid.paidAt).toLocaleDateString() : latestPaid.dueDate}
                            </Badge>
                          ) : prop.tenantId ? (
                            <Badge className="px-2 py-0.5 font-black text-[8px] uppercase tracking-widest border-none bg-amber-500/10 text-amber-600">
                              Invoice auto-generates
                            </Badge>
                          ) : (
                            <Badge className="px-2 py-0.5 font-black text-[8px] uppercase tracking-widest border-none bg-zinc-500/10 text-zinc-500">
                              No tenant assigned
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {activePayment ? (
                            <Button 
                              className="h-7 rounded-lg px-3 text-[10px] font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700 text-white border-none"
                              onClick={() => handleMarkAsPaid(activePayment.id)}
                            >
                              Clear Rent
                            </Button>
                          ) : latestPaid ? (
                            <span className="text-[9px] font-black uppercase text-emerald-600 tracking-widest">Collected</span>
                          ) : (
                            <span className="text-[9px] font-black uppercase text-amber-600 tracking-widest">Invoice pending sync</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {properties.filter(p => p.status === 'rented').length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-zinc-400 font-black text-[10px] uppercase tracking-widest">
                        No rented properties found in portfolio
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Portfolio Projection</p>
                <p className="text-xl font-black text-blue-600 tabular-nums">KES {anticipatedRentTotal.toLocaleString()}</p>
              </div>
              <div className="text-right space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Arrears/Pending</p>
                <p className="text-xl font-black text-rose-600 tabular-nums">KES {collectionLedgerTotal.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <DialogFooter className="p-6 bg-zinc-50 dark:bg-zinc-800/50">
            <Button className="rounded-xl font-black uppercase tracking-widest text-[10px] bg-zinc-950 text-white" onClick={() => setIsAnticipatedOpen(false)}>Close Ledger</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isManageAccessOpen} onOpenChange={setIsManageAccessOpen}>
        <DialogContent className="sm:max-w-[425px] p-0 overflow-hidden border-none shadow-2xl rounded-3xl dark:bg-zinc-900">
          <DialogHeader className="p-6 pb-4 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950">
            <DialogTitle className="text-xl font-black flex items-center gap-2 text-zinc-900 dark:text-white">
              <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <FontAwesomeIcon icon={faUsers} className="h-4 w-4" />
              </div>
              Manage Access
            </DialogTitle>
            <DialogDescription className="text-sm font-medium text-zinc-500 pt-2">
              Invite a co-owner or manager to help manage {managingProperty?.title}.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-500">Manager Email</label>
              <Input
                placeholder="manager@example.com"
                value={managerEmail}
                onChange={e => setManagerEmail(e.target.value)}
                className="h-12 bg-zinc-50 dark:bg-zinc-800/50 border-none rounded-xl focus-visible:ring-1 focus-visible:ring-blue-500"
              />
              <p className="text-[10px] text-zinc-400 font-medium">Note: The user must already have a MyBoma landlord account.</p>
            </div>
          </div>
          <DialogFooter className="p-6 bg-zinc-50 dark:bg-zinc-800/50 flex flex-col sm:flex-row gap-2">
            <Button variant="ghost" className="h-12 rounded-xl font-black uppercase tracking-widest text-xs w-full sm:w-auto" onClick={() => setIsManageAccessOpen(false)}>Cancel</Button>
            <Button className="h-12 rounded-xl font-black uppercase tracking-widest text-xs bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto" onClick={handleAddManager}>Add Manager</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PropertyCard({ property, profile, onEdit, onDelete, onManageAccess, buildingName, tenantName, onViewDetails }: { property: Property, profile: UserProfile, onEdit: (p: Property) => void, onDelete: (id: string) => void, onManageAccess: (p: Property) => void, buildingName?: string, tenantName?: string, onViewDetails?: (p: Property) => void }) {
  return (
    <Card className="flex flex-col group relative">
      {/* Header Row */}
      <CardHeader className="flex flex-row items-start justify-between pb-2 border-b">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg">{property.unitNumber ? `Unit ${property.unitNumber}` : property.title}</h3>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              property.status === 'rented' ? 'bg-success/10 text-success' :
              property.status === 'available' ? 'bg-muted text-muted-foreground' :
              'bg-warning/10 text-warning-foreground'
            }`}>
              {property.status === 'available' ? 'Vacant' : property.status.charAt(0).toUpperCase() + property.status.slice(1)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FontAwesomeIcon icon={faBuilding} className="w-3" />
            <span>{property.location}</span>
          </div>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
              <FontAwesomeIcon icon={faEllipsisV} />
            </Button>
          } />
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => onEdit(property)}>
              <FontAwesomeIcon icon={faEdit} className="mr-2 w-4 text-center text-muted-foreground" /> Edit Unit
            </DropdownMenuItem>
            {profile.uid === property.landlordId && (
              <DropdownMenuItem onClick={() => onManageAccess(property)}>
                <FontAwesomeIcon icon={faUsers} className="mr-2 w-4 text-center text-muted-foreground" /> Manage Tenant
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(property.id)}>
              <FontAwesomeIcon icon={faTrash} className="mr-2 w-4 text-center" /> Delete Unit
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      {/* Facts Strip */}
      <CardContent className="grid grid-cols-3 gap-4 pt-4 pb-4 border-b">
        <div>
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Rent</div>
          <div className="text-sm font-semibold">{formatCurrencyFull(property.price)}<span className="text-[10px] text-muted-foreground font-normal">/mo</span></div>
        </div>
        <div>
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Tenant</div>
          <div className="text-sm font-medium truncate">{tenantName || <span className="text-muted-foreground italic">Vacant</span>}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Type</div>
          <div className="text-sm font-medium capitalize">{property.type}</div>
        </div>
      </CardContent>

      {/* Footer */}
      <div className="flex items-center justify-between p-4 bg-muted/20">
        <div className="text-xs text-muted-foreground">
          {property.status === 'rented' ? 'Next payment in 12 days' : 'Ready for occupancy'}
        </div>
        <Button 
          variant="link"
          size="sm"
          onClick={() => onViewDetails?.(property)}
          className="h-auto p-0 text-xs font-semibold"
        >
          View details <FontAwesomeIcon icon={faChevronRight} className="ml-1.5 w-2" />
        </Button>
      </div>
    </Card>
  );
}
