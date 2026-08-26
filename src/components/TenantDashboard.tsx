import { useState, useEffect } from 'react';
import { UserProfile } from '../App';
import {
  createPesapalRentCheckout,
  createStripeRentCheckout,
  initiateMpesaRentPayment,
  markRentPaymentManual,
  getTenantDashboard,
  createMaintenanceRequest,
  markNotificationRead as markNotificationReadRequest,
  updateMyProfile,
  uploadFile,
} from '../lib/api';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { normalizeRentPayment } from '../lib/rentUtils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faPhone, 
  faEnvelope, 
  faMapMarkerAlt, 
  faTools, 
  faWallet, 
  faFileAlt, 
  faSpinner, 
  faExclamationCircle, 
  faCheckCircle, 
  faClock, 
  faUser, 
  faHome, 
  faBell,
  faPlus,
  faExternalLinkAlt,
  faHistory,
  faEdit,
  faCreditCard,
  faMobileAlt,
  faDownload,
  faReceipt,
  faInfoCircle,
  faBuilding
} from '@fortawesome/free-solid-svg-icons';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface MaintenanceRequest {
  id: string;
  tenantId: string;
  propertyId: string;
  landlordId: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'resolved';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: string;
}

interface RentPayment {
  id: string;
  tenantId: string;
  propertyId: string;
  landlordId: string;
  amount: number;
  status: 'paid' | 'pending' | 'overdue' | 'verifying';
  dueDate: string;
  paidAt?: string;
  receiptUrl?: string;
  providerReference?: string;
  paymentProvider?: string;
}

interface Property {
  id: string;
  landlordId: string;
  title: string;
  location: string;
  status: string;
  tenantId?: string;
}

interface Landlord {
  uid: string;
  displayName: string;
  email: string;
  phone?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  rentPayoutMethod?: string;
  mpesaSettlementPhone?: string;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  createdAt: string;
  read: boolean;
}

interface TenantDashboardProps {
  profile: UserProfile;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function TenantDashboard({ profile, activeTab, setActiveTab }: TenantDashboardProps) {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [payments, setPayments] = useState<RentPayment[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [property, setProperty] = useState<Property | null>(null);
  const [landlord, setLandlord] = useState<Landlord | null>(null);
  const [loading, setLoading] = useState(true);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isBankOpen, setIsBankOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [payingAction, setPayingAction] = useState<string | null>(null);
  const [selectedPaymentForBank, setSelectedPaymentForBank] = useState<RentPayment | null>(null);
  const [isManualPaymentOpen, setIsManualPaymentOpen] = useState(false);
  const [manualPaymentForm, setManualPaymentForm] = useState({ receiptCode: '' });
  const [selectedManualPaymentId, setSelectedManualPaymentId] = useState<string | null>(null);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

  const [tenantProfile, setTenantProfile] = useState({
    displayName: profile.displayName || '',
    phone: profile.phone || '',
    address: profile.address || '',
    avatarUrl: profile.avatarUrl || '',
  });

  // Form state
  const [newRequest, setNewRequest] = useState({
    title: '',
    description: '',
    priority: 'medium' as const,
  });

  // Polls the consolidated tenant dashboard endpoint — replaces the old four
  // Supabase Realtime channels (properties/maintenanceRequests/rentPayments/notifications).
  useEffect(() => {
    let isActive = true;

    const fetchDashboard = async () => {
      try {
        const data = await getTenantDashboard();
        if (!isActive) return;
        setProperty(data.property as Property | null);
        setLandlord(data.landlord as Landlord | null);
        setRequests(data.requests as MaintenanceRequest[]);
        setPayments(data.payments.map((row) => normalizeRentPayment(row as RentPayment)));
        setNotifications(data.notifications as Notification[]);
      } catch (err) {
        console.error('Tenant dashboard fetch failed:', err);
      } finally {
        if (isActive) setLoading(false);
      }
    };

    fetchDashboard();
    const interval = setInterval(fetchDashboard, 30000);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [profile.uid, profile.email]);

  const handleReportIssue = async () => {
    if (!newRequest.title || !newRequest.description) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      if (!property) {
        toast.error("You are not assigned to any property.");
        return;
      }
      const created = await createMaintenanceRequest({
        propertyId: property.id,
        landlordId: property.landlordId,
        title: newRequest.title,
        description: newRequest.description,
        priority: newRequest.priority,
      });

      setRequests((prev) => [...prev, created as MaintenanceRequest]);
      toast.success("Maintenance request submitted!");
      setIsReportOpen(false);
      setNewRequest({ title: '', description: '', priority: 'medium' });
    } catch (error) {
      console.error("Report issue error:", error);
      toast.error("Failed to submit request");
    }
  };

  const markNotificationRead = async (id: string) => {
    try {
      setNotifications((prev) => prev.map((n) => (n.id === id ? {...n, read: true} : n)));
      await markNotificationReadRequest(id);
    } catch (error) {
      console.error("Error marking notification read:", error);
    }
  };

  const handlePayRent = async (paymentId: string, method: 'mpesa' | 'stripe' | 'pesapal') => {
    setPayingAction(`${method}:${paymentId}`);
    try {
      if (method === 'pesapal') {
        const { checkoutUrl } = await createPesapalRentCheckout({
          rentPaymentId: paymentId,
          successUrl: Capacitor.isNativePlatform() ? `https://myboma.vercel.app/?rent_payment=success&provider=pesapal` : `${window.location.origin}/?rent_payment=success&provider=pesapal`,
          cancelUrl: Capacitor.isNativePlatform() ? `https://myboma.vercel.app/?rent_payment=cancelled&provider=pesapal` : `${window.location.origin}/?rent_payment=cancelled&provider=pesapal`,
        });

        if (!checkoutUrl) throw new Error('Pesapal did not return a checkout URL.');
        if (Capacitor.isNativePlatform()) {
          try {
            await Browser.open({ url: checkoutUrl, presentationStyle: 'popover' });
          } catch (err) {
            console.error('Browser.open failed, falling back', err);
            // Fallback 1: system browser
            const newWindow = window.open(checkoutUrl, '_system');
            if (!newWindow) {
              // Fallback 2: webview navigation
              window.location.href = checkoutUrl;
            }
          }
        } else {
          window.location.href = checkoutUrl;
        }
        return;
      }

      if (method === 'stripe') {
        const { checkoutUrl } = await createStripeRentCheckout({
          rentPaymentId: paymentId,
          successUrl: Capacitor.isNativePlatform() ? `https://myboma.vercel.app/?rent_payment=success` : `${window.location.origin}/?rent_payment=success`,
          cancelUrl: Capacitor.isNativePlatform() ? `https://myboma.vercel.app/?rent_payment=cancelled` : `${window.location.origin}/?rent_payment=cancelled`,
        });

        if (!checkoutUrl) throw new Error('Stripe did not return a checkout URL.');
        if (Capacitor.isNativePlatform()) {
          await Browser.open({ url: checkoutUrl });
        } else {
          window.location.assign(checkoutUrl);
        }
        return;
      }

      const response = await initiateMpesaRentPayment({
        rentPaymentId: paymentId,
        phone: tenantProfile.phone || profile.phone,
      });

      toast.success(response.customerMessage || 'M-Pesa prompt sent. The receipt will appear after confirmation.');
    } catch (error: any) {
      toast.error(error.message || "Failed to start payment");
    } finally {
      setPayingAction(null);
    }
  };

  const handleUpdateProfile = async () => {
    try {
      await updateMyProfile(tenantProfile);
      toast.success("Profile updated");
      setIsProfileOpen(false);
    } catch (error) {
      toast.error("Failed to update profile");
    }
  };

  // File storage is still on Supabase pending the Cloudflare R2 migration (Phase 6).
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const { url } = await uploadFile(file, file.name, 'avatar');
      setTenantProfile({ ...tenantProfile, avatarUrl: url });
      await updateMyProfile({ avatarUrl: url });
    } catch (error) {
      toast.error("Failed to upload profile picture");
    } finally {
      setIsUploading(false);
    }
  };

  const currentTab = activeTab || 'dashboard';
  const todayStr = new Date().toISOString().split('T')[0];
  const orderedPayments = [...payments].sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
  const pendingPayments = payments.filter(p => p.status !== 'paid').sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const overduePayments = pendingPayments.filter(p => p.status === 'overdue' || p.dueDate < todayStr);
  const upcomingPayments = pendingPayments.filter(p => !overduePayments.some(overdue => overdue.id === p.id));
  const nextPayment = pendingPayments[0];
  const upcomingPayment = upcomingPayments[0];
  const arrearsTotal = overduePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  let displayUpcoming = upcomingPayments[0];
  if (!displayUpcoming && payments.length > 0) {
    const latestPayment = orderedPayments[0];
    const lastDate = new Date(latestPayment.dueDate);
    lastDate.setMonth(lastDate.getMonth() + 1);
    displayUpcoming = {
      ...latestPayment,
      id: 'projected',
      dueDate: lastDate.toISOString().split('T')[0],
      status: 'pending',
    };
  }

  let upcomingDaysRemaining: number | null = null;
  if (displayUpcoming) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [year, month, day] = displayUpcoming.dueDate.split('-').map(Number);
    const dueDate = new Date(year, month - 1, day);
    const diffTime = dueDate.getTime() - today.getTime();
    upcomingDaysRemaining = Math.round(diffTime / (1000 * 60 * 60 * 24));
  }

  const formatMoney = (amount: number | string) => `KES ${Number(amount || 0).toLocaleString()}`;
  const formatDate = (value?: string) => value
    ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Not set';

  const getReceiptText = (payment: RentPayment) => {
    const isManual = payment.providerReference?.toLowerCase().startsWith('manual-');
    const displayRef = isManual 
      ? `MANUAL-${payment.providerReference?.split('-').pop()}` 
      : (payment.providerReference || payment.id);

    return [
      'MyBoma Rent Receipt',
      `Receipt: ${displayRef}`,
      `Tenant: ${profile.displayName || profile.email}`,
      `Email: ${profile.email}`,
      `Property: ${property?.title || payment.propertyId}`,
      `Amount: ${formatMoney(payment.amount)}`,
      `Status: ${payment.status}`,
      `Due Date: ${formatDate(payment.dueDate)}`,
      `Paid At: ${formatDate(payment.paidAt)}`,
      `Payment Method: ${payment.paymentProvider || 'Not recorded'}`,
    ].join('\n');
  };

  const getReceiptDownloadUrl = (payment: RentPayment) => (
    payment.receiptUrl || `data:text/plain;charset=utf-8,${encodeURIComponent(getReceiptText(payment))}`
  );

  const getReceiptFileName = (payment: RentPayment) => {
    const isManual = payment.providerReference?.toLowerCase().startsWith('manual-');
    const displayRef = isManual 
      ? `MANUAL-${payment.providerReference?.split('-').pop()}` 
      : (payment.providerReference || payment.id);
    return `myboma-receipt-${displayRef}.txt`;
  };

  const rentNotices: Array<Notification & { stored?: boolean }> = [
    ...overduePayments.map(payment => ({
      id: `rent-overdue-${payment.id}`,
      title: 'Rent Clearance Required',
      message: `${formatMoney(payment.amount)} was due ${formatDate(payment.dueDate)}.`,
      type: 'rent_overdue',
      createdAt: payment.dueDate,
      read: false,
      stored: false,
    })),
    ...(upcomingPayment ? [{
      id: `rent-upcoming-${upcomingPayment.id}`,
      title: 'Upcoming Rent Payment',
      message: `${formatMoney(upcomingPayment.amount)} is due ${formatDate(upcomingPayment.dueDate)}.`,
      type: 'rent_due',
      createdAt: upcomingPayment.dueDate,
      read: false,
      stored: false,
    }] : []),
  ];

  const noticeItems: Array<Notification & { stored?: boolean }> = [
    ...notifications.map(note => ({ ...note, stored: true })),
    ...rentNotices,
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
  let reminderAlert = null;
  if (nextPayment) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Parse YYYY-MM-DD as local date to compare with today's midnight
    const [year, month, day] = nextPayment.dueDate.split('-').map(Number);
    const dueDate = new Date(year, month - 1, day);
    
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      reminderAlert = { text: "Your rent is due TODAY.", type: "urgent" };
    } else if (diffDays > 0 && diffDays <= 3) {
      reminderAlert = { text: `Your rent will be due in ${diffDays} day${diffDays === 1 ? '' : 's'}.`, type: "warning" };
    } else if (diffDays < 0) {
      reminderAlert = { text: `Your rent is ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} OVERDUE!`, type: "urgent" };
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <FontAwesomeIcon icon={faSpinner} className="h-10 w-10 animate-spin text-blue-600" />
        <p className="text-sm font-black text-zinc-500 uppercase tracking-widest">Accessing Portal...</p>
      </div>
    );
  }

  const pageTitle = currentTab === 'finances'
    ? 'Finances'
    : currentTab === 'maintenance'
      ? 'Maintenance'
      : currentTab === 'notices'
        ? 'Notices'
        : 'Rent Dashboard';

  const handleManualPaymentSubmit = async () => {
    if (!manualPaymentForm.receiptCode || !selectedManualPaymentId) {
      toast.error("Please enter the M-Pesa receipt code.");
      return;
    }
    setIsSubmittingManual(true);
    try {
      await markRentPaymentManual(selectedManualPaymentId, `M-Pesa Receipt: ${manualPaymentForm.receiptCode}`);
      toast.success("Payment submitted for verification.");
      setIsManualPaymentOpen(false);
      setManualPaymentForm({ receiptCode: '' });
      setSelectedManualPaymentId(null);
    } catch (err: any) {
      toast.error("Failed to submit payment: " + err.message);
    } finally {
      setIsSubmittingManual(false);
    }
  };

  const payButtons = (payment: RentPayment) => {
    if (landlord && landlord.rentPayoutMethod === 'mpesa') {
      return (
        <div className="grid grid-cols-1 gap-2">
          <Button
            className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[9px] uppercase tracking-widest gap-2"
            onClick={() => {
              setSelectedManualPaymentId(payment.id);
              setIsManualPaymentOpen(true);
            }}
          >
            <FontAwesomeIcon icon={faMobileAlt} />
            Pay via M-Pesa (Manual)
          </Button>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-2">
        <Button
          className="col-span-2 h-10 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-[9px] uppercase tracking-widest gap-2"
          onClick={() => handlePayRent(payment.id, 'pesapal')}
          disabled={Boolean(payingAction)}
        >
          <FontAwesomeIcon icon={payingAction === `pesapal:${payment.id}` ? faSpinner : faCreditCard} className={payingAction === `pesapal:${payment.id}` ? 'animate-spin' : ''} />
          Pesapal
        </Button>
        <Button
          className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[9px] uppercase tracking-widest gap-2"
          onClick={() => handlePayRent(payment.id, 'mpesa')}
          disabled={Boolean(payingAction)}
        >
          <FontAwesomeIcon icon={payingAction === `mpesa:${payment.id}` ? faSpinner : faMobileAlt} className={payingAction === `mpesa:${payment.id}` ? 'animate-spin' : ''} />
          Mobile Money
        </Button>
        <Button
          className="h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-[9px] uppercase tracking-widest gap-2"
          onClick={() => {
            setSelectedPaymentForBank(payment);
            setIsBankOpen(true);
          }}
          disabled={Boolean(payingAction)}
        >
          <FontAwesomeIcon icon={faBuilding} />
          Bank
        </Button>
        <Button
          className="h-10 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-black text-[9px] uppercase tracking-widest gap-2 col-span-2"
          onClick={() => handlePayRent(payment.id, 'stripe')}
          disabled={Boolean(payingAction)}
        >
          <FontAwesomeIcon icon={payingAction === `stripe:${payment.id}` ? faSpinner : faCreditCard} className={payingAction === `stripe:${payment.id}` ? 'animate-spin' : ''} />
          Card / International
        </Button>
      </div>
    );
  };

  const paymentStatusBadge = (payment: RentPayment) => {
    let color = 'bg-amber-500 text-white';
    if (payment.status === 'paid') color = 'bg-emerald-500 text-white';
    else if (payment.status === 'verifying') color = 'bg-indigo-500 text-white';
    else if (payment.status === 'overdue') color = 'bg-rose-500 text-white';
    
    return (
      <Badge className={`border-none px-3 py-1 font-black text-[9px] uppercase tracking-widest ${color}`}>
        {payment.status}
      </Badge>
    );
  };

  return (
    <div className="db w-full min-w-0 pb-24 sm:pb-8 animate-in fade-in duration-300">
      {/* ── Page Header ─────────────────────────── */}
      <div className="p-6 md:p-8 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40">
              <FontAwesomeIcon icon={faHome} className="h-2.5 w-2.5" />
              Resident Node
            </span>
            <span className="text-xs text-slate-400 font-medium">·</span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {profile.displayName || profile.email}
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white capitalize">
            {pageTitle}
          </h1>
          <div className="flex items-center gap-4 text-xs text-slate-400 mt-1 font-medium">
            <span className="flex items-center gap-1.5">
              <FontAwesomeIcon icon={faPhone} className="h-2.5 w-2.5" />
              {profile.phone || 'No phone'}
            </span>
            <span className="flex items-center gap-1.5">
              <FontAwesomeIcon icon={faEnvelope} className="h-2.5 w-2.5" />
              {profile.email}
            </span>
            <button
              onClick={() => setIsProfileOpen(true)}
              className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 cursor-pointer underline underline-offset-2"
            >
              Edit Profile
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {nextPayment && currentTab !== 'dashboard' && (
            <Button size="sm" className="font-bold text-xs gap-1.5 rounded-xl cursor-pointer" onClick={() => setActiveTab('dashboard')}>
              <FontAwesomeIcon icon={faWallet} className="h-3 w-3" />
              Pay Rent
            </Button>
          )}
          {property && (
            <Dialog open={isReportOpen} onOpenChange={setIsReportOpen}>
              <DialogTrigger render={
                <Button variant="outline" size="sm" className="font-semibold text-xs gap-1.5 rounded-xl cursor-pointer">
                  <FontAwesomeIcon icon={faTools} className="h-3 w-3 text-slate-400" />
                  Report Issue
                </Button>
              } />
              <DialogContent className="sm:max-w-md p-0 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
                <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">Maintenance Request</DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Submit a repair ticket directly to your property management.
                  </DialogDescription>
                </div>
                <div className="p-6 space-y-3.5">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Issue Title</Label>
                    <Input className="h-10" value={newRequest.title} onChange={e => setNewRequest({...newRequest, title: e.target.value})} placeholder="e.g. Leaking pipe under kitchen sink" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Urgency Level</Label>
                    <Select value={newRequest.priority} onValueChange={(v: any) => setNewRequest({...newRequest, priority: v})}>
                      <SelectTrigger className="h-10 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="low">Low (Cosmetic / General)</SelectItem>
                        <SelectItem value="medium">Medium (Standard Repair)</SelectItem>
                        <SelectItem value="high">High (Urgent Attention)</SelectItem>
                        <SelectItem value="urgent">Urgent (Emergency / Hazard)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Detailed Description</Label>
                    <Textarea className="rounded-xl min-h-[90px] text-xs" value={newRequest.description} onChange={e => setNewRequest({...newRequest, description: e.target.value})} placeholder="Describe what happened and when you noticed it..." />
                  </div>
                </div>
                <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" className="font-semibold text-xs rounded-xl" onClick={() => setIsReportOpen(false)}>Cancel</Button>
                  <Button size="sm" className="font-bold text-xs rounded-xl" onClick={handleReportIssue}>Submit Ticket</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          <Dialog open={isManualPaymentOpen} onOpenChange={setIsManualPaymentOpen}>
            <DialogContent className="sm:max-w-md p-0 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
              <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800 bg-emerald-950/20">
                <DialogTitle className="text-lg font-bold text-emerald-600 dark:text-emerald-400">Direct M-Pesa Settlement</DialogTitle>
                <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Transfer rent to the landlord's registered settlement number and enter the confirmation code.
                </DialogDescription>
              </div>
              <div className="p-6 space-y-4">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-4 border border-slate-200/80 dark:border-slate-700 text-xs space-y-2">
                  <p className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[10px]">Payment Instructions</p>
                  <ol className="text-slate-600 dark:text-slate-300 space-y-1.5 list-decimal list-inside">
                    <li>Open M-Pesa and select <strong>Send Money</strong> or <strong>Lipa na M-Pesa</strong>.</li>
                    <li>Recipient: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{landlord?.mpesaSettlementPhone || landlord?.phone || 'Not provided'}</strong></li>
                    <li>Enter exact rent amount and your PIN.</li>
                    <li>Paste the confirmation receipt code below.</li>
                  </ol>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">M-Pesa Receipt Code</Label>
                  <Input 
                    className="h-10 rounded-xl font-mono uppercase text-xs" 
                    placeholder="e.g. RKJ4ABC123" 
                    value={manualPaymentForm.receiptCode}
                    onChange={e => setManualPaymentForm({...manualPaymentForm, receiptCode: e.target.value.toUpperCase()})}
                  />
                </div>
              </div>
              <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" className="font-semibold text-xs rounded-xl" onClick={() => setIsManualPaymentOpen(false)}>Cancel</Button>
                <Button 
                  size="sm"
                  className="font-bold text-xs rounded-xl" 
                  onClick={handleManualPaymentSubmit}
                  disabled={isSubmittingManual}
                >
                  {isSubmittingManual ? 'Submitting...' : 'Submit Receipt'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="px-6 md:px-8 mt-6">
        {reminderAlert && currentTab === 'dashboard' && (
          <div className={`mb-6 p-4 rounded-2xl flex items-center gap-3 text-xs font-bold ${reminderAlert.type === 'urgent' ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800' : 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800'}`}>
            <FontAwesomeIcon icon={faExclamationCircle} className="h-4 w-4 shrink-0" />
            {reminderAlert.text}
          </div>
        )}

        {currentTab === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {property && landlord ? (
              <>
                <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 flex flex-col justify-between border border-slate-200/80 dark:border-slate-800 shadow-xs">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rent Arrears</span>
                      <FontAwesomeIcon icon={faExclamationCircle} className={arrearsTotal > 0 ? 'text-rose-500 h-3.5 w-3.5' : 'text-emerald-500 h-3.5 w-3.5'} />
                    </div>
                    <div>
                      <p className={`text-2xl font-bold tracking-tight tabular-nums ${arrearsTotal > 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>{formatMoney(arrearsTotal)}</p>
                      <p className="mt-1 text-xs text-slate-400 font-medium">{overduePayments.length} overdue invoice{overduePayments.length === 1 ? '' : 's'}</p>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 flex flex-col justify-between border border-slate-200/80 dark:border-slate-800 shadow-xs">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Upcoming Due</span>
                      <FontAwesomeIcon icon={faClock} className="text-amber-500 h-3.5 w-3.5" />
                    </div>
                    <div>
                      {displayUpcoming ? (
                        <>
                          <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">{formatMoney(displayUpcoming.amount)}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            Due {formatDate(displayUpcoming.dueDate)}
                            <span className="mx-1.5 text-slate-300">·</span>
                            <span className={upcomingDaysRemaining! <= 3 ? 'text-rose-600' : 'text-emerald-600'}>
                              {upcomingDaysRemaining! < 0 ? `${Math.abs(upcomingDaysRemaining!)} days ago` : 
                               upcomingDaysRemaining === 0 ? 'Due Today' : 
                               `In ${upcomingDaysRemaining} day${upcomingDaysRemaining === 1 ? '' : 's'}`}
                            </span>
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">KES 0</p>
                          <p className="mt-1 text-xs text-emerald-600 font-semibold">Rent cleared</p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 flex flex-col justify-between border border-slate-200/80 dark:border-slate-800 shadow-xs sm:col-span-2 lg:col-span-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Checkout / Invoicing</span>
                      <FontAwesomeIcon icon={faWallet} className="text-blue-500 h-3.5 w-3.5" />
                    </div>
                    <div>
                      {nextPayment ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-lg font-bold text-slate-900 dark:text-white">{formatMoney(nextPayment.amount)}</span>
                            {paymentStatusBadge(nextPayment)}
                          </div>
                          {payButtons(nextPayment)}
                        </div>
                      ) : (
                        <div className="py-2 text-center text-xs font-semibold text-emerald-600 flex items-center justify-center gap-1.5">
                          <FontAwesomeIcon icon={faCheckCircle} className="h-3.5 w-3.5" />
                          Account current & cleared
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Current Residence Card */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
                  <div className="grid md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800">
                    <div className="md:col-span-3 p-6 space-y-4">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Active Tenancy</span>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{property.title}</h2>
                        <div className="flex items-center gap-1.5 text-slate-500 mt-1 text-xs font-medium">
                          <FontAwesomeIcon icon={faMapMarkerAlt} className="h-3 w-3 text-slate-400" />
                          {property.location}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Billing Schedule</span>
                          <span className="font-bold text-slate-900 dark:text-white">Monthly</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Lease Status</span>
                          <span className="font-bold text-emerald-600">Active</span>
                        </div>
                      </div>
                    </div>
                    <div className="md:col-span-2 p-6 bg-slate-50/50 dark:bg-slate-800/20 space-y-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Property Manager</span>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center font-bold text-xs shrink-0">
                            <FontAwesomeIcon icon={faUser} className="h-3 w-3" />
                          </div>
                          <span className="font-bold text-slate-900 dark:text-white">{landlord.displayName}</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center font-bold text-xs shrink-0">
                            <FontAwesomeIcon icon={faPhone} className="h-3 w-3" />
                          </div>
                          <span className="text-slate-600 dark:text-slate-300">{landlord.phone || "No phone listed"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col items-center justify-center text-center rounded-2xl p-12 shadow-xs">
                <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
                  <FontAwesomeIcon icon={faExclamationCircle} className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">Awaiting Unit Assignment</h3>
                <p className="text-slate-500 text-xs max-w-sm">Your resident account is not yet assigned to an active property lease.</p>
              </div>
            )}
          </div>
        )}

        {currentTab === 'finances' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Transaction History</h2>
              <p className="text-xs text-slate-500 mt-0.5">Cleared rent receipts and payment audit trail.</p>
            </div>

            {orderedPayments.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {orderedPayments.map(payment => (
                  <div key={payment.id} className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-base font-bold text-slate-900 dark:text-white tabular-nums">{formatMoney(payment.amount)}</span>
                        {paymentStatusBadge(payment)}
                      </div>
                      <div className="flex flex-col gap-1 text-xs text-slate-400 font-medium">
                        <span>Due: {formatDate(payment.dueDate)}</span>
                        <span>{payment.paidAt ? `Paid: ${formatDate(payment.paidAt)}` : 'Awaiting confirmation'}</span>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                      {payment.status === 'paid' ? (
                        <a
                          href={getReceiptDownloadUrl(payment)}
                          download={getReceiptFileName(payment)}
                          target={payment.receiptUrl ? '_blank' : undefined}
                          rel={payment.receiptUrl ? 'noreferrer' : undefined}
                          className="inline-flex w-full h-9 items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
                        >
                          <FontAwesomeIcon icon={payment.receiptUrl ? faExternalLinkAlt : faDownload} className="h-3 w-3" />
                          Download Receipt
                        </a>
                      ) : (
                        <Button
                          size="sm"
                          className="w-full h-9 rounded-xl font-bold text-xs"
                          onClick={() => setActiveTab('dashboard')}
                        >
                          Pay Invoice
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                <FontAwesomeIcon icon={faHistory} className="h-6 w-6 opacity-40 mb-2" />
                <p className="font-semibold text-xs">No Payment Records Found</p>
              </div>
            )}
          </div>
        )}

        {currentTab === 'maintenance' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Maintenance Tickets</h2>
                <p className="text-xs text-slate-500 mt-0.5">Track reported issues and management repair status.</p>
              </div>
              <Button size="sm" className="font-bold text-xs gap-1.5 rounded-xl" onClick={() => setIsReportOpen(true)}>
                <FontAwesomeIcon icon={faPlus} className="h-3 w-3" /> New Request
              </Button>
            </div>

            {requests.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[...requests].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(req => (
                  <div key={req.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white">{req.title}</h3>
                        <Badge variant={req.status === 'resolved' ? 'success' : req.status === 'in-progress' ? 'info' : 'warning'}>
                          {req.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{req.description}</p>
                    </div>
                    <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                      <span className="text-slate-400 font-medium">{formatDate(req.createdAt)}</span>
                      <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-500">{req.priority} Priority</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                <FontAwesomeIcon icon={faTools} className="h-6 w-6 opacity-40 mb-2" />
                <p className="font-semibold text-xs">No Maintenance Requests</p>
              </div>
            )}
          </div>
        )}

        {currentTab === 'notices' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Resident Notices</h2>
              <p className="text-xs text-slate-500 mt-0.5">Rent clearance notices and community broadcasts.</p>
            </div>

            {noticeItems.length > 0 ? (
              <div className="space-y-2.5">
                {noticeItems.map(note => (
                  <div
                    key={note.id}
                    className={`w-full flex items-start gap-3.5 p-4 rounded-2xl border transition-all text-left ${note.read ? 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 opacity-80' : 'bg-white dark:bg-slate-900 border-blue-200 dark:border-blue-800 shadow-xs'}`}
                    onClick={() => note.stored && !note.read && markNotificationRead(note.id)}
                  >
                    <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center shrink-0">
                      <FontAwesomeIcon icon={faBell} className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-0.5">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white">{note.title}</h4>
                        {!note.read && <span className="h-2 w-2 rounded-full bg-blue-600" />}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{note.message}</p>
                      <span className="text-[10px] text-slate-400 font-medium mt-1.5 block">
                        {formatDate(note.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                <FontAwesomeIcon icon={faBell} className="h-6 w-6 opacity-40 mb-2" />
                <p className="font-semibold text-xs">No Notices Recorded</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Profile Settings Dialog */}
      <Dialog open={isProfileOpen} onOpenChange={setIsProfileOpen}>
        <DialogContent className="sm:max-w-md p-0 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
          <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">Resident Profile</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Update your contact credentials and notification details.
            </DialogDescription>
          </div>
          <div className="p-6 space-y-3.5">
            <div className="flex flex-col items-center gap-3">
              <div className="relative h-20 w-20 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 shadow-sm">
                <img src={tenantProfile.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.uid}`} alt="Profile" className="h-full w-full object-cover" />
                <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 hover:opacity-100 cursor-pointer transition-opacity">
                  <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                  <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={isUploading} />
                </label>
              </div>
              {isUploading && <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 animate-pulse">Uploading...</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Full Name</Label>
              <Input className="h-10" value={tenantProfile.displayName} onChange={e => setTenantProfile({...tenantProfile, displayName: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Phone Number</Label>
              <Input className="h-10" value={tenantProfile.phone} onChange={e => setTenantProfile({...tenantProfile, phone: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Permanent Address / Notes</Label>
              <Textarea className="rounded-xl min-h-[70px] text-xs" value={tenantProfile.address} onChange={e => setTenantProfile({...tenantProfile, address: e.target.value})} />
            </div>
          </div>
          <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" className="font-semibold text-xs rounded-xl" onClick={() => setIsProfileOpen(false)}>Cancel</Button>
            <Button size="sm" className="font-bold text-xs rounded-xl" onClick={handleUpdateProfile}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bank Transfer Dialog */}
      <Dialog open={isBankOpen} onOpenChange={setIsBankOpen}>
        <DialogContent className="sm:max-w-md p-0 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
          <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800 bg-blue-950/20">
            <DialogTitle className="text-lg font-bold text-blue-600 dark:text-blue-400">Direct Bank Settlement</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Transfer funds via EFT/RTGS to the landlord's designated account.
            </DialogDescription>
          </div>
          <div className="p-6 space-y-3.5">
            <div className="space-y-2.5">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Bank Institution</span>
                <p className="text-xs font-bold text-slate-900 dark:text-white">{landlord?.bankName || 'Equity Bank / KCB (Default)'}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Account Name</span>
                <p className="text-xs font-bold text-slate-900 dark:text-white">{landlord?.bankAccountName || landlord?.displayName || 'Property Management'}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Account Number</span>
                <p className="text-xs font-bold font-mono text-slate-900 dark:text-white tracking-wider">{landlord?.bankAccountNumber || '0123456789012'}</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/80 text-amber-800 dark:text-amber-300 text-xs leading-relaxed">
              After payment, share the transaction receipt with the landlord to mark the invoice as settled.
            </div>
          </div>
          <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
            <Button size="sm" className="font-bold text-xs rounded-xl" onClick={() => setIsBankOpen(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
