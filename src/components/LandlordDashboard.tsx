import { useState, useEffect, useRef, useMemo } from 'react';
import { getSubscriptionFeatures } from '../lib/landlordSubscription';
import { supabase } from '../supabase';
import { provisionUser, markRentPaymentManual } from '../lib/api';
import { logAudit } from '../lib/audit';
import { ensureRentInvoiceForProperty, syncAutomaticRentInvoices } from '../lib/rentInvoices';
import { formatStatKes, normalizeRentPayment } from '../lib/rentUtils';
import { UserProfile } from '../App';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// Using FontAwesome instead of Lucide
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBuilding, faWallet, faChartLine, faBell, faFileExcel, faMoon, faSun, faHome, faTools, faUsers, faChevronDown, faChevronUp, faPlus, faMinus, faCheck, faTrash, faEdit, faSearch, faFilter, faDownload, faMapMarkerAlt, faPhone, faEnvelope, faUser, faUpload, faTimes, faImage, faChevronLeft, faChevronRight, faSpinner, faEllipsisV, faChartPie, faInfoCircle, faBolt, faBars, faCog, faSignOutAlt } from '@fortawesome/free-solid-svg-icons';
import { toast } from 'sonner';
import { convertToWebP } from '@/lib/image-utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { OccupancyDonutChart, RentCollectionBarChart, FinancialYieldGrid } from './AnalyticsCharts';

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

  useEffect(() => {
    let propSub: any = null;
    let reqSub: any = null;
    let paySub: any = null;
    let bookingSub: any = null;
    let expenseSub: any = null;
    let invSub: any = null;
    let notifSub: any = null;
    let isActive = true;
    const channelToken = `${profile.uid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const fetchAndSubscribe = async () => {
      // Buildings
      const bldsQuery = supabase.from('buildings').select('*');
      const { data: blds } = await bldsQuery;
      if (!isActive) return;
      if (blds) setBuildings(blds);

      // Get properties this user manages
      const { data: managed } = await supabase
        .from('property_managers')
        .select('propertyId')
        .eq('userId', profile.uid);
      
      const managedIds = managed?.map(m => m.propertyId) || [];
      const filterString = `landlordId.eq.${profile.uid}${managedIds.length > 0 ? `,id.in.(${managedIds.join(',')})` : ''}`;

      // Properties
      const propsQuery = supabase.from('properties').select('*').or(filterString);
      const { data: props } = await propsQuery;
      if (!isActive) return;
      const loadedProperties = (props || []) as Property[];
      if (props) setProperties(loadedProperties);
      
      propSub = supabase
        .channel(`landlord-props-${channelToken}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'properties' }, (payload) => {
          if (!isActive) return;
          const prop = payload.new as Property;
          if (payload.eventType === 'INSERT') {
            if (prop.landlordId === profile.uid || managedIds.includes(prop.id)) {
              setProperties(prev => [...prev, prop]);
            }
          } else if (payload.eventType === 'UPDATE') {
            if (prop.landlordId === profile.uid || managedIds.includes(prop.id)) {
              setProperties(prev => {
                const exists = prev.find(p => p.id === prop.id);
                if (exists) return prev.map(p => p.id === prop.id ? prop : p);
                return [...prev, prop];
              });
            } else {
              setProperties(prev => prev.filter(p => p.id !== prop.id));
            }
          } else if (payload.eventType === 'DELETE') {
            setProperties(prev => prev.filter(p => p.id !== payload.old.id));
          }
        })
        .subscribe();

      // Requests
      const reqsQuery = supabase.from('maintenanceRequests').select('*');
      const { data: reqs } = await reqsQuery;
      if (!isActive) return;
      if (reqs) setRequests(reqs);

      reqSub = supabase
        .channel(`landlord-reqs-${channelToken}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenanceRequests' }, (payload) => {
          if (!isActive) return;
          if (payload.eventType === 'INSERT') {
            setRequests(prev => [...prev, payload.new as MaintenanceRequest]);
          } else if (payload.eventType === 'UPDATE') {
            setRequests(prev => prev.map(r => r.id === payload.new.id ? payload.new as MaintenanceRequest : r));
          } else if (payload.eventType === 'DELETE') {
            setRequests(prev => prev.filter(r => r.id !== payload.old.id));
          }
        })
        .subscribe();

      // Payments
      const paysQuery = supabase.from('rentPayments').select('*');
      const { data: pays, error: paysError } = await paysQuery.order('dueDate', { ascending: false });
      if (paysError) {
        console.error('Landlord rent fetch:', paysError);
        toast.error('Could not load rent ledger');
      }
      let loadedPayments = pays ? pays.map((row) => normalizeRentPayment(row as RentPayment)) : [];
      if (!isActive) return;
      if (pays) setPayments(loadedPayments);

      if (profile.role !== 'admin' && isActive) {
        try {
          await syncAutomaticRentInvoices(
            supabase,
            loadedProperties,
            loadedPayments,
            profile.uid,
            profile.platformId,
          );
          const {data: refreshed, error: refreshError} = await supabase
            .from('rentPayments')
            .select('*')
            .eq('landlordId', profile.uid)
            .order('dueDate', {ascending: false});
          if (!refreshError && refreshed && isActive) {
            setPayments(refreshed.map((row) => normalizeRentPayment(row as RentPayment)));
          }
        } catch (syncError) {
          console.error('Automatic rent invoice sync:', syncError);
        }
      }

      paySub = supabase
        .channel(`landlord-pays-${channelToken}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rentPayments' }, (payload) => {
          if (!isActive) return;
          if (payload.eventType === 'INSERT') {
            setPayments((prev) => [...prev, normalizeRentPayment(payload.new as RentPayment)]);
          } else if (payload.eventType === 'UPDATE') {
            setPayments((prev) =>
              prev.map((p) =>
                p.id === payload.new.id ? normalizeRentPayment(payload.new as RentPayment) : p,
              ),
            );
          } else if (payload.eventType === 'DELETE') {
            setPayments((prev) => prev.filter((p) => p.id !== payload.old.id));
          }
        })
        .subscribe();

      // BNB bookings
      const bookingQuery = supabase.from('bookings').select('*').order('startDate', { ascending: false });
      const { data: bookingRows } = await bookingQuery;
      if (!isActive) return;
      if (bookingRows) setBookings(bookingRows);

      bookingSub = supabase
        .channel(`landlord-bookings-${channelToken}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, (payload) => {
          if (!isActive) return;
          if (payload.eventType === 'INSERT') {
            setBookings(prev => [payload.new as Booking, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setBookings(prev => prev.map(b => b.id === payload.new.id ? payload.new as Booking : b));
          } else if (payload.eventType === 'DELETE') {
            setBookings(prev => prev.filter(b => b.id !== payload.old.id));
          }
        })
        .subscribe();

      // Operating expenses / books
      const expenseQuery = supabase.from('expenses').select('*').order('expenseDate', { ascending: false });
      const { data: expenseRows } = await expenseQuery;
      if (!isActive) return;
      if (expenseRows) setExpenses(expenseRows);

      expenseSub = supabase
        .channel(`landlord-expenses-${channelToken}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, (payload) => {
          if (!isActive) return;
          if (payload.eventType === 'INSERT') {
            setExpenses(prev => [payload.new as Expense, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setExpenses(prev => prev.map(e => e.id === payload.new.id ? payload.new as Expense : e));
          } else if (payload.eventType === 'DELETE') {
            setExpenses(prev => prev.filter(e => e.id !== payload.old.id));
          }
        })
        .subscribe();

      // Invitations (Tenants list)
      const invQuery = supabase.from('invitations').select('*');
      if (profile.role !== 'admin') {
        invQuery.eq('landlordId', profile.uid);
      }
      const { data: invRows } = await invQuery;
      if (!isActive) return;
      if (invRows) setInvitations(invRows as Invitation[]);

      const invFilter = profile.role === 'admin' ? undefined : `landlordId=eq.${profile.uid}`;
      invSub = supabase
        .channel(`landlord-invs-${channelToken}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'invitations', ...(invFilter ? { filter: invFilter } : {}) }, (payload) => {
          if (!isActive) return;
          if (payload.eventType === 'INSERT') {
            setInvitations(prev => {
              const exists = prev.some(i => i.email.toLowerCase() === payload.new.email.toLowerCase());
              if (exists) return prev;
              return [...prev, payload.new as Invitation];
            });
          } else if (payload.eventType === 'UPDATE') {
            setInvitations(prev => prev.map(i => i.email.toLowerCase() === payload.new.email.toLowerCase() ? payload.new as Invitation : i));
          } else if (payload.eventType === 'DELETE') {
            setInvitations(prev => prev.filter(i => i.email.toLowerCase() !== payload.old.email.toLowerCase()));
          }
        })
        .subscribe();

      // Notifications
      const notifQuery = supabase
        .from('notifications')
        .select('*')
        .eq('recipientEmail', profile.email.toLowerCase())
        .order('createdAt', { ascending: false });
      const { data: notifRows } = await notifQuery;
      if (!isActive) return;
      if (notifRows) setNotifications(notifRows);

      notifSub = supabase
        .channel(`landlord-notifs-${channelToken}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipientEmail=eq.${profile.email.toLowerCase()}` }, (payload) => {
          if (!isActive) return;
          if (payload.eventType === 'INSERT') {
            setNotifications(prev => [payload.new, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setNotifications(prev => prev.map(n => n.id === payload.new.id ? payload.new : n));
          } else if (payload.eventType === 'DELETE') {
            setNotifications(prev => prev.filter(n => n.id !== payload.old.id));
          }
        })
        .subscribe();

      setLoading(false);
    };

    fetchAndSubscribe();

    return () => {
      isActive = false;
      if (propSub) supabase.removeChannel(propSub);
      if (reqSub) supabase.removeChannel(reqSub);
      if (paySub) supabase.removeChannel(paySub);
      if (bookingSub) supabase.removeChannel(bookingSub);
      if (expenseSub) supabase.removeChannel(expenseSub);
      if (invSub) supabase.removeChannel(invSub);
      if (notifSub) supabase.removeChannel(notifSub);
    };
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
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/web/notifications/remind-rent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ rentPaymentId: payment.id }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || 'Failed to send reminder');
      }

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
        const fileName = `${profile.uid}/${Date.now()}-${i}.webp`;
        const { error } = await supabase.storage
          .from('properties')
          .upload(fileName, file);

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('properties')
          .getPublicUrl(fileName);

        uploadedUrls.push(publicUrl);
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
      const { error } = await supabase.rpc('add_property_manager', {
        p_property_id: managingProperty.id,
        p_email: managerEmail,
        p_role: 'manager'
      });
      if (error) throw error;
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
      const { data, error } = await supabase
        .from('buildings')
        .insert([{
          name: newBuilding.name,
          address: newBuilding.address,
          landlordId: profile.uid,
          platformId: profile.platformId,
        }])
        .select();
      
      if (error) throw error;
      setBuildings(prev => [...prev, ...data]);
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
      const { data, error } = await supabase
        .from('buildings')
        .update({
          name: editBuildingForm.name,
          address: editBuildingForm.address,
        })
        .eq('id', editBuildingForm.id)
        .select('*');
      if (error) throw error;
      if (data && data.length > 0) {
        setBuildings(prev => prev.map(b => b.id === editBuildingForm.id ? data[0] : b));
      }
      toast.success("Asset updated!");
      setIsEditBuildingOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to update asset");
    }
  };

  const handleDeleteBuilding = async (id: string) => {
    if (!confirm("Are you sure you want to delete this asset group? Any standalone units inside will become unassigned.")) return;
    try {
      const { error } = await supabase.from('buildings').delete().eq('id', id);
      if (error) throw error;
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
      const { error } = await supabase
        .from('properties')
        .insert([{
          landlordId: profile.uid,
          platformId: profile.platformId,
          buildingId: newProperty.buildingId === 'none' ? null : newProperty.buildingId,
          unitNumber: newProperty.unitNumber,
          title: newProperty.title,
          description: newProperty.description,
          type: newProperty.type,
          price: Number(newProperty.price),
          location: newProperty.location,
          status: 'available',
          amenities: newProperty.amenities.split(',').map(a => a.trim()).filter(a => a),
          images: newProperty.images.split(',').map(url => url.trim()).filter(url => url),
          createdAt: new Date().toISOString(),
        }]);
      
      if (error) throw error;
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
          landlordId: profile.uid,
          platformId: profile.platformId,
          buildingId: bulkAddForm.buildingId,
          unitNumber: unitNum,
          title: `${building.name} - ${unitNum}`,
          description: `Bulk created ${bulkAddForm.type} unit in ${building.name}.`,
          type: bulkAddForm.type,
          price: Number(bulkAddForm.price),
          location: building.address,
          status: 'available',
          amenities: bulkAddForm.amenities.split(',').map(a => a.trim()).filter(a => a),
          images: bulkAddForm.images.split(',').map(url => url.trim()).filter(url => url),
          createdAt: new Date().toISOString(),
        });
      }
      const { error } = await supabase.from('properties').insert(inserts);
      if (error) throw error;
      
      toast.success(`Successfully created ${bulkAddForm.count} units!`);
      setIsBulkAddOpen(false);
      setBulkAddForm({ buildingId: 'none', type: 'residential', price: '', prefix: '', startNumber: 1, count: 10, amenities: '', images: '' });
    } catch (error) {
      toast.error('Failed to create units in bulk');
    }
  };

  const refreshLandlordPayments = async () => {
    const {data, error} = await supabase
      .from('rentPayments')
      .select('*')
      .eq('landlordId', profile.uid)
      .order('dueDate', {ascending: false});
    if (error) throw error;
    if (data) setPayments(data.map((row) => normalizeRentPayment(row as RentPayment)));
  };

  const refreshLandlordInvitations = async () => {
    const { data } = await supabase
      .from('invitations')
      .select('*')
      .eq('landlordId', profile.uid);
    if (data) setInvitations(data as Invitation[]);
  };

  const handleRecordExpense = async () => {
    try {
      const { error } = await supabase
        .from('expenses')
        .insert([{
          landlordId: profile.uid,
          platformId: profile.platformId,
          propertyId: newExpense.propertyId === 'none' ? null : newExpense.propertyId,
          category: newExpense.category,
          description: newExpense.description,
          amount: Number(newExpense.amount),
          expenseDate: newExpense.expenseDate,
          receiptUrl: newExpense.receiptUrl || null,
          createdAt: new Date().toISOString(),
        }]);
      if (error) throw error;
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
      const { error } = await supabase.from('properties').delete().eq('id', id);
      if (error) throw error;
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
      const { error } = await supabase.from('properties').update(data).eq('id', id);
      if (error) throw error;

      if (data.status === 'rented' && data.tenantId) {
        await ensureRentInvoiceForProperty(
          supabase,
          {...editingProperty, ...data, id},
          String(data.tenantId),
          profile.uid,
          profile.platformId,
          payments,
        );
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
      const { error } = await supabase.from('users').update(landlordProfile).eq('uid', profile.uid);
      if (error) throw error;
      toast.success("Profile updated");
      setIsProfileOpen(false);
    } catch (error) {
      toast.error("Failed");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success('Signed out');
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const convertedFile = await convertToWebP(file);
      const fileName = `${profile.uid}/avatar-${Date.now()}.webp`;
      const { error } = await supabase.storage.from('properties').upload(fileName, convertedFile);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('properties').getPublicUrl(fileName);
      setLandlordProfile({ ...landlordProfile, avatarUrl: publicUrl });
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
      await syncAutomaticRentInvoices(
        supabase,
        properties,
        payments.map(p => p.id === paymentId ? { ...p, status: 'paid' } : p),
        profile.uid,
        profile.platformId
      );
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
      const { error } = await supabase.from('properties').update({ 
        tenantId: tenantEmail, 
        status: 'rented' 
      }).eq('id', selectedPropertyToAssign);
      
      if (error) throw error;

      const rentedProperty = {...selectedProp, tenantId: tenantEmail, status: 'rented' as const};
      
      // When assigning, we generate the first invoice. 
      // It should be 'pending' even if created today, giving 30 days of grace logic.
      await ensureRentInvoiceForProperty(
        supabase,
        rentedProperty,
        tenantEmail,
        profile.uid,
        profile.platformId,
        payments,
        true // initialAssignment flag
      );
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
      
      // 1. Unassign from properties
      const { error } = await supabase.from('properties').update({ 
        tenantId: null, 
        status: 'available' 
      }).ilike('tenantId', normalizedEmail);
      
      if (error) throw error;
      
      // 2. Delete unpaid invoices for this tenant
      await supabase.from('rentPayments')
        .delete()
        .ilike('tenantId', normalizedEmail)
        .neq('status', 'paid');

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
      
      // 1. Remove invitation
      const { error: invError } = await supabase.from('invitations').delete().ilike('email', normalizedEmail);
      if (invError) throw invError;
      
      // 2. Unassign from properties
      const { error: propError } = await supabase.from('properties').update({ 
        tenantId: null, 
        status: 'available' 
      }).ilike('tenantId', normalizedEmail);
      if (propError) throw propError;

      // 3. Delete unpaid invoices
      await supabase.from('rentPayments')
        .delete()
        .ilike('tenantId', normalizedEmail)
        .neq('status', 'paid');

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
        const normalizedEmail = email.toLowerCase();
        await supabase.from('invitations').delete().ilike('email', normalizedEmail);
        await supabase.from('properties').update({ tenantId: null, status: 'available' }).ilike('tenantId', normalizedEmail);
        await supabase.from('rentPayments').delete().ilike('tenantId', normalizedEmail).neq('status', 'paid');
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
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id);

      if (error) throw error;
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      toast.success('Marked as read');
    } catch (err: any) {
      console.error('Error marking read:', err);
      toast.error('Failed to mark notification as read');
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('recipientEmail', profile.email.toLowerCase())
        .eq('read', false);

      if (error) throw error;
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      toast.success('All notifications marked as read');
    } catch (err: any) {
      console.error('Error marking all read:', err);
      toast.error('Failed to mark all as read');
    }
  };

  const handleDeleteNotification = async (id: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id);

      if (error) throw error;
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
      const { error } = await supabase.from('maintenanceRequests').update({ status }).eq('id', id);
      if (error) throw error;
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
    <div className="db min-h-screen pb-24 animate-in fade-in duration-700">
      <div className="pt-6 px-6 sm:px-8 mb-4 animate-in fade-in slide-in-from-bottom-2 flex justify-between items-start">
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
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <button className="btn-primary text-[11px] font-bold tracking-wider px-4 py-2.5 h-auto shadow-md hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
                <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" /> 
                <span className="hidden sm:inline">Create New</span>
              </button>
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
        )}
      </div>

      <div className="px-6 mt-6">
        {/* ── Dashboard Overview ─────────────────────── */}
        {(activeTab === 'dashboard' || !activeTab) && (
          <div className="mt-4 space-y-6 animate-in fade-in duration-500">
            {/* Quick stats row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-1 bg-indigo-600 rounded-2xl p-5 flex flex-col gap-3 shadow-lg shadow-indigo-500/20">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-black uppercase tracking-widest text-indigo-100">Subscription</p>
                  <FontAwesomeIcon icon={faBolt} className="text-indigo-200 h-3 w-3" />
                </div>
                <p className="text-xl font-black text-white leading-tight">{subscriptionFeatures.label} Plan</p>
                <p className="text-[9px] font-bold text-indigo-100 uppercase tracking-wider">
                  {profile.subscriptionExpiresAt 
                    ? `Active until ${new Date(profile.subscriptionExpiresAt).toLocaleDateString()}` 
                    : 'Prepaid Plan'}
                </p>
              </div>

              {[
                {
                  label: 'Total Units',
                  value: properties.length,
                  sub: `${properties.filter(p => p.status === 'available').length} available`,
                  color: 'bg-blue-500/10 text-blue-600',
                  icon: faHome,
                },
                {
                  label: 'Listings Limit',
                  value: `${properties.length} / ${subscriptionFeatures.maxListings ?? '∞'}`,
                  sub: 'Units Capacity',
                  color: 'bg-purple-500/10 text-purple-600',
                  icon: faChartPie,
                },
                {
                  label: 'Revenue (Paid)',
                  value: `KES ${payments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount || 0), 0).toLocaleString()}`,
                  sub: `${payments.filter(p => p.status === 'pending' || p.status === 'overdue').length} pending`,
                  color: 'bg-amber-500/10 text-amber-600',
                  icon: faWallet,
                },
                {
                  label: 'Maintenance',
                  value: requests.filter(r => r.status !== 'resolved').length,
                  sub: `${requests.filter(r => r.status === 'resolved').length} resolved`,
                  color: 'bg-rose-500/10 text-rose-600',
                  icon: faTools,
                },
              ].map(stat => (
                <div key={stat.label} className="bg-white rounded-2xl border border-zinc-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">{stat.label}</p>
                    <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${stat.color}`}>
                      <FontAwesomeIcon icon={stat.icon} className="h-3 w-3" />
                    </div>
                  </div>
                  <p className="text-2xl font-black text-zinc-900 tabular-nums">{stat.value}</p>
                  <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">{stat.sub}</p>
                </div>
              ))}
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
                    <p className="text-center text-[10px] font-black uppercase tracking-widest text-zinc-300 py-10">No payments yet</p>
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
                    <p className="text-center text-[10px] font-black uppercase tracking-widest text-zinc-300 py-10">No maintenance requests</p>
                  )}
                </div>
              </div>
              ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-10 text-center">
                <FontAwesomeIcon icon={faTools} className="mb-3 h-8 w-8 text-zinc-300" />
                <p className="text-sm font-black text-zinc-700">Maintenance hub not included</p>
                <p className="mt-1 max-w-xs text-xs font-medium text-zinc-500">
                  Upgrade to Growth or Pro for maintenance tickets. Your {subscriptionFeatures.label} plan includes up to{' '}
                  {subscriptionFeatures.maxListings ?? 'unlimited'} listings.
                </p>
              </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'properties' && (
          <div className="mt-4 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="text-xl font-black text-zinc-900">Portfolio Index</h3>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <div className="relative">
                  <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-400" />
                  <Input placeholder="Search property or unit..." className="h-8 pl-8 text-[10px] font-bold rounded-lg border-zinc-200" value={propertySearch} onChange={(e) => { setPropertySearch(e.target.value); setPropertyPage(1); }} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Building:</span>
                  <select className="btn-ghost py-1 h-8 text-[10px] font-black uppercase tracking-widest max-w-[150px] truncate" value={buildingFilter} onChange={(e) => { setBuildingFilter(e.target.value); setPropertyPage(1); }}>
                    <option value="all">All Buildings</option>
                    {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    <option value="standalone">Standalone Assets</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Status Index:</span>
                  <select className="btn-ghost py-1 h-8 text-[10px] font-black uppercase tracking-widest" value={propertyStatusFilter} onChange={(e) => { setPropertyStatusFilter(e.target.value); setPropertyPage(1); }}>
                    <option value="all">Global view</option>
                    <option value="available">Available</option>
                    <option value="rented">Rented</option>
                    <option value="booked">Booked</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="space-y-6">
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

                  return (
                    <details key={bId} className="group border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm" open>
                      <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-black text-sm uppercase tracking-widest text-zinc-800 dark:text-zinc-200 list-none [&::-webkit-details-marker]:hidden border-b border-transparent group-open:border-zinc-100 dark:group-open:border-zinc-800 transition-colors">
                        <div className="flex items-center gap-3">
                          <FontAwesomeIcon icon={faBuilding} className="text-zinc-400" />
                          {bName} <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded-full text-[9px]">{props.length}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          {bId !== 'standalone' && (
                            <div className="flex items-center gap-2" onClick={e => e.preventDefault()}>
                              <button onClick={() => { setEditBuildingForm({ id: bId, name: bName, address: buildings.find(b => b.id === bId)?.address || '' }); setIsEditBuildingOpen(true); }} className="text-zinc-400 hover:text-blue-500 transition-colors p-1" title="Edit Asset">
                                <FontAwesomeIcon icon={faEdit} className="h-3 w-3" />
                              </button>
                              <button onClick={() => handleDeleteBuilding(bId)} className="text-zinc-400 hover:text-rose-500 transition-colors p-1" title="Delete Asset">
                                <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                          <FontAwesomeIcon icon={faChevronDown} className="h-3 w-3 text-zinc-400 group-open:rotate-180 transition-transform" />
                        </div>
                      </summary>
                      {props.length > 0 ? (
                        <div className="p-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-b-2xl">
                          {props.map(property => (
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
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 sm:p-8 text-center text-zinc-500 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-b-2xl">
                          <p className="text-sm font-semibold">No units found in this asset.</p>
                        </div>
                      )}
                    </details>
                  );
                });
              })()}
              {paginatedProperties.length === 0 && (
                <div className="text-center py-20 text-zinc-400 font-bold text-xs uppercase tracking-widest">
                  No properties found
                </div>
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
          <div className="mt-4">
            <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:bg-zinc-900 rounded-3xl overflow-hidden">
              <CardHeader className="p-4 sm:p-5 border-b border-zinc-50 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-black">Maintenance Tickets</CardTitle>
                  <CardDescription className="font-medium text-zinc-500 text-xs">Managing technical debt across your portfolio.</CardDescription>
                </div>
                <div className="relative w-full sm:max-w-xs">
                  <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-400" />
                  <Input 
                    placeholder="Search tickets..." 
                    className="h-8 pl-8 text-[10px] font-bold rounded-lg border-zinc-200" 
                    value={maintenanceSearch} 
                    onChange={(e) => { setMaintenanceSearch(e.target.value); setMaintenancePage(1); }} 
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-zinc-50/50 dark:bg-zinc-800/50 border-none">
                      <TableHead className="px-4 py-3 font-black text-[10px] uppercase tracking-widest text-zinc-400">Issue</TableHead>
                      <TableHead className="py-3 font-black text-[10px] uppercase tracking-widest text-zinc-400">Severity</TableHead>
                      <TableHead className="py-3 font-black text-[10px] uppercase tracking-widest text-zinc-400">Status</TableHead>
                      <TableHead className="px-4 py-3 font-black text-[10px] uppercase tracking-widest text-zinc-400 text-right">Update</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRequests.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="h-32 text-center text-zinc-400 font-bold text-xs uppercase tracking-widest">
                          No maintenance tickets found
                        </TableCell>
                      </TableRow>
                    )}
                    {paginatedRequests.map((req) => (
                      <TableRow key={req.id} className="border-zinc-50 dark:border-zinc-800">
                        <TableCell className="px-4 py-3">
                          <div className="font-bold text-sm text-zinc-900 dark:text-white">{req.title}</div>
                          <div className="text-[10px] text-zinc-400 font-medium mt-0.5">{req.description}</div>
                        </TableCell>
                        <TableCell><Badge className={`px-2 py-0.5 font-black text-[8px] uppercase tracking-widest border-none ${req.priority === 'urgent' ? 'bg-rose-500/10 text-rose-600' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>{req.priority}</Badge></TableCell>
                        <TableCell><Badge className="px-2 py-0.5 font-black text-[8px] uppercase tracking-widest border-none bg-blue-500/10 text-blue-600">{req.status}</Badge></TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          <select className="btn-ghost py-1 h-8 text-[10px] font-black uppercase tracking-widest ml-auto" value={req.status} onChange={(e) => updateRequestStatus(req.id, e.target.value)}>
                            <option value="pending">Pending</option>
                            <option value="in-progress">Fixing</option>
                            <option value="resolved">Clear</option>
                          </select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {totalRequestPages > 1 && (
                  <div className="flex items-center justify-between p-4 border-t border-zinc-50 dark:border-zinc-800">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest pl-2">
                      Page {maintenancePage} of {totalRequestPages}
                    </span>
                    <div className="flex items-center gap-2 pr-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        disabled={maintenancePage === 1}
                        onClick={() => setMaintenancePage(p => p - 1)}
                        className="rounded-xl font-black uppercase tracking-widest text-[9px] h-8"
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
                        className="rounded-xl font-black uppercase tracking-widest text-[9px] h-8"
                      >
                        Next <FontAwesomeIcon icon={faChevronRight} className="ml-2" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'finances' && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-col md:flex-row gap-4 justify-between">
              <div className="flex flex-1 gap-4">
                <div className="relative flex-1 max-w-sm group">
                  <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-400" />
                  <Input placeholder="Search ledger..." className="h-10 pl-9 rounded-xl font-bold text-xs" value={paymentSearch} onChange={(e) => { setPaymentSearch(e.target.value); setPaymentPage(1); }} />
                </div>
                <select className="btn-ghost py-1 h-10 text-[10px] font-black uppercase tracking-widest" value={paymentStatusFilter} onChange={(e) => { setPaymentStatusFilter(e.target.value); setPaymentPage(1); }}>
                  <option value="all">Global Status</option>
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={downloadExcel} className="h-10 rounded-xl font-black text-[10px] uppercase tracking-widest border-zinc-200"><FontAwesomeIcon icon={faFileExcel} className="mr-2" /> Export</Button>
                <Button variant="outline" onClick={() => setIsExpenseOpen(true)} className="h-10 rounded-xl font-black text-[10px] uppercase tracking-widest border-zinc-200"><FontAwesomeIcon icon={faChartPie} className="mr-2" /> Expense</Button>
              </div>
            </div>

            <div className="stats-grid !p-0">
              <div className="stat-card cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors" onClick={() => setIsAnticipatedOpen(true)}>
                <div className="stat-top"><span className="stat-label">Expected Rent</span><div className="stat-icon si-blue"><FontAwesomeIcon icon={faChartLine} /></div></div>
                <div className="stat-num">{formatStatKes(anticipatedRentTotal)}</div>
                <div className="stat-desc">Monthly projected revenue</div>
                <div className="stat-bar bar-blue"></div>
              </div>
              <div className="stat-card">
                <div className="stat-top"><span className="stat-label">Rent Collected</span><div className="stat-icon si-teal"><FontAwesomeIcon icon={faWallet} /></div></div>
                <div className="stat-num">{formatStatKes(paidRentTotal)}</div>
                <div className="stat-desc">KES {paidRentTotal.toLocaleString('en-KE')} collected</div>
                <div className="stat-bar bar-teal"></div>
              </div>
              <div className="stat-card">
                <div className="stat-top"><span className="stat-label">Operating Costs</span><div className="stat-icon si-amber"><FontAwesomeIcon icon={faChartPie} /></div></div>
                <div className="stat-num">{(expenseTotal / 1000).toFixed(1)}k</div>
                <div className="stat-desc">Expenses recorded</div>
                <div className="stat-bar bar-amber"></div>
              </div>
              <div className="stat-card">
                <div className="stat-top"><span className="stat-label">Net Performance</span><div className="stat-icon si-red"><FontAwesomeIcon icon={faChartLine} /></div></div>
                <div className="stat-num">{(netIncome / 1000).toFixed(1)}k</div>
                <div className="stat-desc">Receivable: {receivablesTotal.toLocaleString()}</div>
                <div className="stat-bar bar-red"></div>
              </div>
            </div>

            <div className="panels !p-0">
              <OccupancyDonutChart data={{ available: availableCount, rented: rentedCount, booked: bookedCount }} />
              <RentCollectionBarChart data={{ collected: paidRentTotal, pending: pendingRentTotal, overdue: overdueRentTotal }} />
            </div>

            <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:bg-zinc-900 rounded-3xl overflow-hidden">
              <CardHeader className="p-4 sm:p-5 border-b border-zinc-50 dark:border-zinc-800"><CardTitle className="text-base font-black">Ledger Transactions</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-zinc-50/50 dark:bg-zinc-800/50 border-none">
                      <TableHead className="px-4 py-3 font-black text-[10px] uppercase tracking-widest text-zinc-400">Asset</TableHead>
                      <TableHead className="py-3 font-black text-[10px] uppercase tracking-widest text-zinc-400">Tenant</TableHead>
                      <TableHead className="py-3 font-black text-[10px] uppercase tracking-widest text-zinc-400">Due Date</TableHead>
                      <TableHead className="py-3 font-black text-[10px] uppercase tracking-widest text-zinc-400">Amount</TableHead>
                      <TableHead className="px-4 py-3 font-black text-[10px] uppercase tracking-widest text-zinc-400 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedPayments.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="h-32 text-center text-zinc-400 font-bold text-xs uppercase tracking-widest">
                          {payments.length === 0
                            ? 'No rent invoices yet — assign a tenant to a unit to auto-generate'
                            : 'No transactions match your search or filter'}
                        </TableCell>
                      </TableRow>
                    )}
                    {paginatedPayments.map((payment) => {
                      const prop = properties.find(p => p.id === payment.propertyId);
                      return (
                        <TableRow key={payment.id} className="border-zinc-50 dark:border-zinc-800">
                          <TableCell className="px-4 py-3">
                            <div className="font-bold text-sm text-zinc-900 dark:text-white">{prop?.title || 'Unknown Asset'}</div>
                            <div className="text-[10px] text-zinc-400 font-medium">{prop?.unitNumber ? `Unit ${prop.unitNumber}` : prop?.location}</div>
                          </TableCell>
                          <TableCell className="text-xs text-zinc-500">{payment.tenantId}</TableCell>
                          <TableCell>
                            <div className={`text-[10px] font-black uppercase tracking-widest ${payment.status === 'paid' ? 'text-emerald-500' : payment.status === 'overdue' ? 'text-rose-500' : 'text-zinc-400'}`}>
                              {payment.status === 'paid' ? 'Completed' : payment.dueDate || 'No Date'}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm font-black tabular-nums">KES {Number(payment.amount).toLocaleString()}</TableCell>
                          <TableCell className="px-4 py-3 text-right">
                            {payment.status !== 'paid' ? (
                              <div className="flex flex-col gap-1 sm:flex-row justify-end">
                                <Button 
                                  variant="outline"
                                  className="h-7 rounded-lg px-3 text-[10px] font-black uppercase tracking-widest bg-white hover:bg-zinc-100 text-zinc-600 border-zinc-200"
                                  onClick={() => sendRentReminder(payment)}
                                >
                                  Remind
                                </Button>
                                <Button 
                                  className="h-7 rounded-lg px-3 text-[10px] font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700 text-white border-none"
                                  onClick={() => handleMarkAsPaid(payment.id)}
                                >
                                  Mark Paid
                                </Button>
                              </div>
                            ) : (
                              <Badge className="bg-emerald-500/10 text-emerald-600 border-none text-[8px] font-black uppercase">Cleared</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {totalPaymentPages > 1 && (
                  <div className="flex items-center justify-between p-4 border-t border-zinc-50 dark:border-zinc-800">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest pl-2">
                      Page {paymentPage} of {totalPaymentPages}
                    </span>
                    <div className="flex items-center gap-2 pr-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        disabled={paymentPage === 1}
                        onClick={() => setPaymentPage(p => p - 1)}
                        className="rounded-xl font-black uppercase tracking-widest text-[9px] h-8"
                      >
                        <FontAwesomeIcon icon={faChevronLeft} className="mr-2" /> Prev
                      </Button>
                      <div className="flex items-center gap-1">
                        {[...Array(totalPaymentPages)].map((_, i) => (
                          <Button
                            key={i}
                            variant={paymentPage === i + 1 ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setPaymentPage(i + 1)}
                            className={`h-8 w-8 rounded-lg font-black text-[9px] ${paymentPage === i + 1 ? 'bg-zinc-950 text-white' : 'text-zinc-500'}`}
                          >
                            {i + 1}
                          </Button>
                        ))}
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        disabled={paymentPage === totalPaymentPages}
                        onClick={() => setPaymentPage(p => p + 1)}
                        className="rounded-xl font-black uppercase tracking-widest text-[9px] h-8"
                      >
                        Next <FontAwesomeIcon icon={faChevronRight} className="ml-2" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'tenants' && (
          <div className="px-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* 3 Metric Tiles */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 flex flex-col gap-1 border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Active</span>
                <span className="text-xl font-black text-zinc-900 dark:text-white">{tenantList.filter(t => t.status === 'active').length}</span>
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 flex flex-col gap-1 border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Invited</span>
                <span className="text-xl font-black text-zinc-900 dark:text-white">{tenantList.filter(t => t.status === 'invited').length}</span>
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 flex flex-col gap-1 border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Overdue</span>
                <span className="text-xl font-black text-rose-500 dark:text-rose-400">{tenantList.filter(t => t.status === 'overdue').length}</span>
              </div>
            </div>

            {/* Search + Invite + Filters */}
            <div className="flex flex-col gap-4 mb-4">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-400" />
                  <Input 
                    placeholder="Search tenants" 
                    className="h-10 pl-8 bg-transparent border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-medium" 
                    value={tenantSearch} 
                    onChange={(e) => { setTenantSearch(e.target.value); setTenantPage(1); }} 
                  />
                </div>
                <Button className="h-10 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-bold px-4" onClick={() => setIsCreateTenantOpen(true)}>
                  <FontAwesomeIcon icon={faPlus} className="mr-2" /> Invite
                </Button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {['All', 'Active', 'Invited', 'Overdue'].map(f => (
                  <button 
                    key={f}
                    onClick={() => { setTenantFilter(f as any); setTenantPage(1); }}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors border ${
                      tenantFilter === f 
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 border-transparent' 
                        : 'bg-transparent text-zinc-500 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Tenant Cards */}
            <div className="flex flex-col gap-3">
              {paginatedTenants.length === 0 ? (
                <div className="border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-3">
                  <div className="h-10 w-10 flex items-center justify-center">
                    <FontAwesomeIcon icon={faUsers} className="h-6 w-6 text-zinc-400" />
                  </div>
                  <p className="text-zinc-500 text-sm font-medium">No {tenantFilter !== 'All' ? tenantFilter.toLowerCase() : 'invited'} tenants yet. Tap <span className="font-bold text-zinc-900 dark:text-white">Invite</span> to add one.</p>
                </div>
              ) : (
                paginatedTenants.map((tenant) => (
                  <div key={tenant.email} className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/50 rounded-2xl p-4 flex items-center gap-4 shadow-sm relative group overflow-hidden">
                    <div className="h-10 w-10 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-800/30">
                      <span className="font-black text-sm">{tenant.displayName.charAt(0).toUpperCase() || 'U'}</span>
                    </div>
                    <div className="flex-1 min-w-0 py-0.5">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-bold text-zinc-900 dark:text-white truncate">{tenant.displayName || 'No Name'}</span>
                        {tenant.status === 'active' && <Badge className="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20 h-4 px-1.5 text-[8px] uppercase tracking-wider font-black">Active</Badge>}
                        {tenant.status === 'overdue' && <Badge className="bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 border-rose-100 dark:border-rose-500/20 h-4 px-1.5 text-[8px] uppercase tracking-wider font-black">Overdue</Badge>}
                        {tenant.status === 'invited' && <Badge className="bg-zinc-50 text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 h-4 px-1.5 text-[8px] uppercase tracking-wider font-black">Invited</Badge>}
                      </div>
                      <div className="text-xs text-zinc-500 truncate mb-1.5">{tenant.email}</div>
                      <div className="flex flex-wrap gap-1">
                        {tenant.assignedProperties.length > 0 ? tenant.assignedProperties.map((p: any) => (
                          <div key={p.id} className="flex items-center gap-1.5 bg-zinc-50 dark:bg-zinc-800/50 rounded-md px-2 py-1 border border-zinc-200 dark:border-zinc-700">
                            <FontAwesomeIcon icon={faBuilding} className="h-2.5 w-2.5 text-zinc-400" />
                            <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-300">{buildings.find(b => b.id === properties.find(prop => prop.id === p.id)?.buildingId)?.name || 'Standalone Asset'} · {p.unitNumber || 'Unit'}</span>
                          </div>
                        )) : (
                          <span className="text-[10px] font-medium text-zinc-400 italic">No assigned units</span>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={
                        <button className="h-8 w-8 rounded-lg text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center justify-center shrink-0 transition-colors">
                          <FontAwesomeIcon icon={faEllipsisV} />
                        </button>
                      } />
                      <DropdownMenuContent align="end" className="w-56 p-2 rounded-2xl border-zinc-100 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-900">
                        <DropdownMenuItem className="cursor-pointer rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800" onClick={() => { setAssigningTenantEmail(tenant.email); setIsAssignDialogOpen(true); }}>
                          <FontAwesomeIcon icon={faPlus} className="mr-2 text-indigo-500 w-4 text-center" /> Assign Asset
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer rounded-xl px-3 py-2.5 text-xs font-bold text-amber-600 dark:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10" onClick={() => handleUnassignTenant(tenant.email)}>
                          <FontAwesomeIcon icon={faMinus} className="mr-2 text-amber-500 w-4 text-center" /> Unassign Asset
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer rounded-xl px-3 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10" onClick={() => handleDeleteTenant(tenant.email)}>
                          <FontAwesomeIcon icon={faTrash} className="mr-2 text-rose-500 w-4 text-center" /> Delete Tenant
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))
              )}
            </div>
            
            {/* Pagination */}
            {totalTenantPages > 1 && (
              <div className="flex items-center justify-between mt-6 px-2">
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
          <div className="mt-4">
            <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:bg-zinc-900 rounded-3xl overflow-hidden animate-in fade-in duration-300">
              <CardHeader className="p-4 sm:p-5 border-b border-zinc-100 dark:border-zinc-800 flex flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-purple-50 dark:bg-purple-950/30 flex items-center justify-center text-purple-600">
                    <FontAwesomeIcon icon={faBell} className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-black">Notifications Hub</CardTitle>
                    <CardDescription className="text-xs">Stay updated on booking requests, maintenance alerts, and rent ledger updates.</CardDescription>
                  </div>
                </div>
                {notifications.some(n => !n.read) && (
                  <Button
                    variant="outline"
                    onClick={handleMarkAllAsRead}
                    className="h-9 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider text-purple-600 border-purple-100 hover:bg-purple-50 dark:border-purple-900/30 dark:hover:bg-purple-950/20 gap-2 shrink-0"
                  >
                    Mark All Read
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-4 sm:p-5">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                    <div className="relative mb-4">
                      <div className="h-16 w-16 rounded-3xl bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 dark:text-zinc-600">
                        <FontAwesomeIcon icon={faBell} className="h-6 w-6 animate-pulse" />
                      </div>
                      <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-zinc-300 border-2 border-white dark:border-zinc-900" />
                    </div>
                    <h3 className="text-sm font-black text-zinc-900 dark:text-white">All Caught Up!</h3>
                    <p className="text-xs text-zinc-500 max-w-sm mt-1">You have no new or archived notifications in your property ledger.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {notifications.map((notif) => {
                      let icon = faBell;
                      let iconColor = 'text-zinc-500';
                      let iconBg = 'bg-zinc-50 dark:bg-zinc-800/50';

                      if (notif.type === 'booking' || notif.type?.includes('booking')) {
                        icon = faBuilding;
                        iconColor = 'text-indigo-600 dark:text-indigo-400';
                        iconBg = 'bg-indigo-50 dark:bg-indigo-950/30';
                      } else if (notif.type === 'maintenance' || notif.type?.includes('maintenance')) {
                        icon = faTools;
                        iconColor = 'text-amber-600 dark:text-amber-400';
                        iconBg = 'bg-amber-50 dark:bg-amber-950/30';
                      } else if (notif.type === 'payment' || notif.type?.includes('payment') || notif.type?.includes('rent')) {
                        icon = faWallet;
                        iconColor = 'text-emerald-600 dark:text-emerald-400';
                        iconBg = 'bg-emerald-50 dark:bg-emerald-950/30';
                      } else if (notif.type === 'urgent' || notif.type === 'alert') {
                        icon = faBolt;
                        iconColor = 'text-rose-600 dark:text-rose-400';
                        iconBg = 'bg-rose-50 dark:bg-rose-950/30';
                      }

                      return (
                        <div
                          key={notif.id}
                          className={`flex items-start gap-4 p-4 rounded-2xl border transition-all duration-150 relative group ${
                            notif.read
                              ? 'border-zinc-50 bg-zinc-50/20 dark:border-zinc-800/30 dark:bg-zinc-900/10 opacity-75'
                              : 'border-purple-100 bg-purple-50/15 dark:border-purple-950/20 dark:bg-purple-950/5 shadow-xs'
                          }`}
                        >
                          <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}>
                            <FontAwesomeIcon icon={icon} className="h-4 w-4" />
                          </div>

                          <div className="flex-1 min-w-0 pr-12">
                            <div className="flex items-center gap-2">
                              <h4 className={`text-xs uppercase tracking-wider ${notif.read ? 'font-bold text-zinc-700 dark:text-zinc-300' : 'font-black text-zinc-900 dark:text-white'}`}>
                                {notif.title}
                              </h4>
                              {!notif.read && (
                                <span className="h-1.5 w-1.5 rounded-full bg-purple-600 shadow-[0_0_6px_#9333ea]" />
                              )}
                            </div>
                            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed break-words">
                              {notif.message}
                            </p>
                            <span className="text-[10px] font-bold text-zinc-400 mt-2 block">
                              {new Date(notif.createdAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>

                          <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                            {!notif.read && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleMarkAsRead(notif.id)}
                                className="h-7 w-7 rounded-lg text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/30"
                                title="Mark as read"
                              >
                                <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteNotification(notif.id)}
                              className="h-7 w-7 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                              title="Delete notification"
                            >
                              <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
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

function PropertyCard({ property, profile, onEdit, onDelete, onManageAccess, buildingName }: { property: Property, profile: UserProfile, onEdit: (p: Property) => void, onDelete: (id: string) => void, onManageAccess: (p: Property) => void, buildingName?: string }) {
  return (
    <Card className="overflow-hidden border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm dark:bg-zinc-900/50 cursor-pointer transition-all hover:shadow-md group rounded-2xl flex flex-col">
      <div className="flex flex-row p-3 gap-3 items-center">
        <div className="h-20 w-24 shrink-0 rounded-xl bg-zinc-100 dark:bg-zinc-800 relative overflow-hidden">
          <img src={property.images[0] || `https://picsum.photos/seed/${property.id}/400/300`} alt={property.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" referrerPolicy="no-referrer" />
          <div className="absolute top-1.5 left-1.5 flex flex-col gap-1 items-start">
            <Badge className={`shadow-sm border-none px-1.5 py-0 font-black text-[7px] uppercase tracking-widest ${property.status === 'available' ? 'bg-emerald-500 text-white' : property.status === 'rented' ? 'bg-blue-500 text-white' : 'bg-amber-500 text-white'}`}>{property.status}</Badge>
          </div>
        </div>
        <div className="flex flex-col flex-1 min-w-0 py-0.5">
          <div className="flex items-center justify-between mb-1">
            <Badge variant="outline" className="border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 font-bold text-[8px] uppercase px-1.5 py-0">{property.type}</Badge>
            {property.unitNumber && <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest truncate">U-{property.unitNumber}</span>}
          </div>
          <CardTitle className="text-sm font-black text-zinc-900 dark:text-white line-clamp-1">{property.title}</CardTitle>
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-bold mt-0.5 truncate"><FontAwesomeIcon icon={faMapMarkerAlt} className="h-2.5 w-2.5 shrink-0" /><span className="truncate">{property.location}</span></div>
          <p className="text-sm font-black text-zinc-900 dark:text-white mt-1.5 tabular-nums">KSh {property.price.toLocaleString()}</p>
        </div>
      </div>
      <CardFooter className="flex gap-1.5 px-3 pb-3 pt-0 mt-0">
        <Button variant="ghost" size="sm" className="flex-1 h-8 px-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 font-bold text-[10px]" onClick={() => onEdit(property)}><FontAwesomeIcon icon={faEdit} className="mr-1 sm:mr-1.5" /> Edit</Button>
        {profile.uid === property.landlordId && (
          <Button variant="ghost" size="sm" className="flex-1 h-8 px-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-bold text-[10px]" onClick={() => onManageAccess(property)}><FontAwesomeIcon icon={faUsers} className="mr-1 sm:mr-1.5" /> Access</Button>
        )}
        <Button variant="ghost" size="sm" className="flex-1 h-8 px-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 font-bold text-[10px] hover:text-rose-600" onClick={() => onDelete(property.id)}><FontAwesomeIcon icon={faTrash} className="mr-1 sm:mr-1.5" /> Del</Button>
      </CardFooter>
    </Card>
  );
}
