import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { UserProfile } from '../App';
import { createPesapalRentCheckout, createStripeRentCheckout, initiateMpesaRentPayment } from '../lib/api';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import {
  matchesTenant,
  normalizeRentPayment,
  tenantPropertyOrFilter,
  tenantRentOrFilter,
} from '../lib/rentUtils';
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
  status: 'paid' | 'pending' | 'overdue';
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

  useEffect(() => {
    let propSub: any = null;
    let reqSub: any = null;
    let paySub: any = null;
    let noteSub: any = null;
    let isActive = true;
    const channelToken = `${profile.uid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const fetchAndSubscribe = async () => {
      const emailLower = profile.email.toLowerCase();

      // Fetch assigned property
      const { data: propDocs, error: propError } = await supabase
        .from('properties')
        .select('id,landlordId,title,location,status,tenantId')
        .or(tenantPropertyOrFilter(profile));
      if (propError) console.error('Tenant property fetch:', propError);
      if (!isActive) return;

      if (propDocs && propDocs.length > 0) {
        const propData = propDocs[0] as Property;
        setProperty(propData);
        
        const { data: landlordData } = await supabase
          .from('users')
          .select('uid,displayName,email,phone,bankName,bankAccountNumber,bankAccountName,rentRecipientId,rentPayoutMethod,mpesaSettlementPhone')
          .eq('uid', propData.landlordId)
          .single();
          
        if (landlordData) {
          if (!isActive) return;
          if (landlordData.rentRecipientId && landlordData.rentRecipientId !== landlordData.uid) {
            const { data: recipientData } = await supabase
              .from('users')
              .select('uid,displayName,email,phone,bankName,bankAccountNumber,bankAccountName,rentPayoutMethod,mpesaSettlementPhone')
              .eq('uid', landlordData.rentRecipientId)
              .single();
            if (recipientData) {
              setLandlord(recipientData as Landlord);
            } else {
              setLandlord(landlordData as Landlord);
            }
          } else {
            setLandlord(landlordData as Landlord);
          }
        }
      }

      // Real-time: Properties
      propSub = supabase
        .channel(`tenant-props-${channelToken}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'properties' }, async (payload) => {
          const row = (payload.new || payload.old) as Property | undefined;
          if (row && !matchesTenant(row.tenantId, profile)) return;
          if (!isActive) return;
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const propData = payload.new as Property;
            setProperty(propData);
            const { data: landlordData } = await supabase.from('users').select('uid,displayName,email,phone,bankName,bankAccountNumber,bankAccountName').eq('uid', propData.landlordId).single();
            if (landlordData) setLandlord(landlordData as Landlord);
          } else if (payload.eventType === 'DELETE') {
            setProperty(null);
            setLandlord(null);
          }
        })
        .subscribe();

      // Real-time: Maintenance Requests
      const { data: reqs } = await supabase
        .from('maintenanceRequests')
        .select('id,tenantId,propertyId,landlordId,title,description,status,priority,createdAt')
        .eq('tenantId', profile.uid);
      if (!isActive) return;
      if (reqs) setRequests(reqs);

      reqSub = supabase
        .channel(`tenant-reqs-${channelToken}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenanceRequests', filter: `tenantId=eq.${profile.uid}` }, (payload) => {
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

      // Real-time: Rent Payments
      const { data: pays, error: paysError } = await supabase
        .from('rentPayments')
        .select('id,tenantId,propertyId,landlordId,amount,status,dueDate,paidAt,receiptUrl,providerReference,paymentProvider')
        .or(tenantRentOrFilter(profile))
        .order('dueDate', { ascending: false });
      if (paysError) console.error('Tenant rent fetch:', paysError);
      if (!isActive) return;
      if (pays) setPayments(pays.map((row) => normalizeRentPayment(row as RentPayment)));

      paySub = supabase
        .channel(`tenant-pays-${channelToken}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rentPayments' }, (payload) => {
          if (!isActive) return;
          const row = (payload.new || payload.old) as RentPayment | undefined;
          if (row && !matchesTenant(row.tenantId, profile)) return;
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

      // Real-time: Notifications
      const { data: notes } = await supabase
        .from('notifications')
        .select('id,title,message,type,createdAt,read')
        .eq('recipientEmail', emailLower)
        .order('createdAt', { ascending: false });
      if (!isActive) return;
      if (notes) setNotifications(notes);

      noteSub = supabase
        .channel(`tenant-notes-${channelToken}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipientEmail=eq.${emailLower}` }, (payload) => {
          if (!isActive) return;
          if (payload.eventType === 'INSERT') {
            setNotifications(prev => [payload.new as Notification, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setNotifications(prev => prev.map(n => n.id === payload.new.id ? payload.new as Notification : n));
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
      if (noteSub) supabase.removeChannel(noteSub);
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
      const { error } = await supabase
        .from('maintenanceRequests')
        .insert([{
          tenantId: profile.uid,
          propertyId: property.id,
          landlordId: property.landlordId,
          title: newRequest.title,
          description: newRequest.description,
          priority: newRequest.priority,
          status: 'pending',
          createdAt: new Date().toISOString(),
        }]);
      
      if (error) throw error;

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
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id);
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
      const { error } = await supabase.from('users').update(tenantProfile).eq('uid', profile.uid);
      if (error) throw error;
      toast.success("Profile updated");
      setIsProfileOpen(false);
    } catch (error) {
      toast.error("Failed to update profile");
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const fileName = `${profile.uid}/avatar-${Date.now()}.${file.name.split('.').pop()}`;
      const { error } = await supabase.storage.from('properties').upload(fileName, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('properties').getPublicUrl(fileName);
      setTenantProfile({ ...tenantProfile, avatarUrl: publicUrl });
      await supabase.from('users').update({ avatarUrl: publicUrl }).eq('uid', profile.uid);
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
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/web/rent-payments/${selectedManualPaymentId}/mark-manual`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ note: `M-Pesa Receipt: ${manualPaymentForm.receiptCode}` })
      });
      if (!res.ok) throw new Error(await res.text());
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
    <div className="db pb-24 sm:pb-8 animate-in fade-in duration-700">
      <div className="hero">
        <div className="hero-row">
          <div>
            <h1 className="hero-title">{pageTitle}</h1>
            <div className="hidden sm:flex flex-col items-start sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs text-zinc-400 mt-2 font-bold">
              <div className="flex items-center gap-1.5">
                <FontAwesomeIcon icon={faPhone} className="h-3 w-3" />
                <span>{profile.phone || 'No phone set'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <FontAwesomeIcon icon={faEnvelope} className="h-3 w-3" />
                <span>{profile.email}</span>
              </div>
              <Button variant="link" size="sm" className="h-auto p-0 text-zinc-500 font-black uppercase tracking-widest text-[10px] hover:text-zinc-900" onClick={() => setIsProfileOpen(true)}>
                Secure Profile
              </Button>
            </div>
          </div>
          <div className="hero-actions flex flex-wrap gap-2">
            {nextPayment && currentTab !== 'dashboard' && (
              <button className="btn-primary" onClick={() => setActiveTab('dashboard')}>
                <FontAwesomeIcon icon={faWallet} className="mr-1" /> Pay Rent
              </button>
            )}
            {property && (
              <Dialog open={isReportOpen} onOpenChange={setIsReportOpen}>
                <DialogTrigger render={
                  <button className="btn-ghost hidden sm:inline-flex">
                    <FontAwesomeIcon icon={faTools} className="mr-1" /> Maintenance
                  </button>
                } />
                <DialogContent className="sm:max-w-[500px] rounded-3xl border-none shadow-2xl p-0 overflow-hidden bg-white dark:bg-zinc-900">
                  <div className="bg-zinc-950 p-8 text-white">
                    <DialogTitle className="text-2xl font-black">Maintenance Request</DialogTitle>
                    <DialogDescription className="text-zinc-400 font-medium mt-1">Send a request to property management.</DialogDescription>
                  </div>
                  <div className="p-8 space-y-6">
                    <div className="space-y-2">
                      <Label className="text-xs font-black uppercase tracking-widest text-zinc-400">Issue Title</Label>
                      <Input className="h-12 rounded-xl" value={newRequest.title} onChange={e => setNewRequest({...newRequest, title: e.target.value})} placeholder="Leaking faucet" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-black uppercase tracking-widest text-zinc-400">Urgency Level</Label>
                      <Select value={newRequest.priority} onValueChange={(v: any) => setNewRequest({...newRequest, priority: v})}>
                        <SelectTrigger className="h-12 rounded-xl border-zinc-200 font-bold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-black uppercase tracking-widest text-zinc-400">Details</Label>
                      <Textarea className="rounded-xl min-h-[100px]" value={newRequest.description} onChange={e => setNewRequest({...newRequest, description: e.target.value})} placeholder="Describe the issue" />
                    </div>
                  </div>
                  <div className="p-8 bg-zinc-50 dark:bg-zinc-800/50 flex justify-end gap-4">
                    <Button variant="ghost" className="font-bold rounded-xl" onClick={() => setIsReportOpen(false)}>Cancel</Button>
                    <Button className="h-12 px-8 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-black shadow-lg" onClick={handleReportIssue}>Submit Ticket</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            <Dialog open={isManualPaymentOpen} onOpenChange={setIsManualPaymentOpen}>
              <DialogContent className="sm:max-w-[450px] p-6 rounded-3xl border-none bg-white dark:bg-zinc-900 shadow-2xl">
                <DialogHeader>
                  <DialogTitle className="text-xl font-black uppercase tracking-tight text-emerald-600">Manual M-Pesa Payment</DialogTitle>
                  <DialogDescription className="font-medium text-zinc-500">
                    Your landlord requires direct M-Pesa payments. Please follow the instructions below and provide the receipt code.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-6 py-4">
                  <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800 p-4 border border-zinc-100 dark:border-zinc-700">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Instructions</p>
                    <ol className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 space-y-2 list-decimal list-inside">
                      <li>Go to your M-Pesa menu and select <strong>Send Money</strong> or <strong>Lipa na M-Pesa</strong>.</li>
                      <li>
                        Use the recipient number/till: 
                        <span className="ml-2 font-black text-emerald-600 px-2 py-0.5 bg-emerald-50 rounded-md">
                          {landlord?.mpesaSettlementPhone || landlord?.phone || 'Not provided'}
                        </span>
                      </li>
                      <li>Enter the exact rent amount.</li>
                      <li>Complete the transaction with your PIN.</li>
                      <li>Copy the M-Pesa receipt code (e.g., <span className="font-mono text-xs">RKJ4...</span>) and paste it below.</li>
                    </ol>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">M-Pesa Receipt Code</label>
                    <Input 
                      className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800 font-mono uppercase" 
                      placeholder="e.g. RKJ4ABC123" 
                      value={manualPaymentForm.receiptCode}
                      onChange={e => setManualPaymentForm({...manualPaymentForm, receiptCode: e.target.value.toUpperCase()})}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" className="rounded-xl font-bold" onClick={() => setIsManualPaymentOpen(false)}>Cancel</Button>
                  <Button 
                    className="h-10 px-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black" 
                    onClick={handleManualPaymentSubmit}
                    disabled={isSubmittingManual}
                  >
                    {isSubmittingManual ? 'Verifying...' : 'Submit Verification'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 mt-6">
        {reminderAlert && currentTab === 'dashboard' && (
          <div className={`mb-6 p-4 rounded-2xl flex items-center gap-3 font-black text-sm uppercase tracking-widest ${reminderAlert.type === 'urgent' ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20' : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'}`}>
            <FontAwesomeIcon icon={faExclamationCircle} className="h-5 w-5 shrink-0" />
            {reminderAlert.text}
          </div>
        )}

        {currentTab === 'dashboard' && (
          <div className="space-y-4">
            {property && landlord ? (
              <>
                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 flex flex-col justify-between border border-zinc-200 dark:border-zinc-800 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Rent Arrears</span>
                      <FontAwesomeIcon icon={faExclamationCircle} className={arrearsTotal > 0 ? 'text-rose-500 h-4 w-4' : 'text-emerald-500 h-4 w-4'} />
                    </div>
                    <div>
                      <p className={`text-2xl font-black tabular-nums ${arrearsTotal > 0 ? 'text-rose-600' : 'text-zinc-900 dark:text-white'}`}>{formatMoney(arrearsTotal)}</p>
                      <p className="mt-1 text-xs font-bold text-zinc-400">{overduePayments.length} overdue invoice{overduePayments.length === 1 ? '' : 's'}</p>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 flex flex-col justify-between border border-zinc-200 dark:border-zinc-800 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Upcoming Rent</span>
                      <FontAwesomeIcon icon={faClock} className="text-amber-500 h-4 w-4" />
                    </div>
                    <div>
                      {displayUpcoming ? (
                        <>
                          <p className="text-2xl font-black text-zinc-900 dark:text-white tabular-nums">{formatMoney(displayUpcoming.amount)}</p>
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                            Due {formatDate(displayUpcoming.dueDate)}
                            <span className="mx-2 text-zinc-300">•</span>
                            <span className={upcomingDaysRemaining! <= 3 ? 'text-rose-500' : 'text-emerald-500'}>
                              {upcomingDaysRemaining! < 0 ? `${Math.abs(upcomingDaysRemaining!)} days ago` : 
                               upcomingDaysRemaining === 0 ? 'Due Today' : 
                               `In ${upcomingDaysRemaining} day${upcomingDaysRemaining === 1 ? '' : 's'}`}
                            </span>
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-2xl font-black text-zinc-900 dark:text-white tabular-nums">KES 0</p>
                          <p className="mt-1 text-xs font-bold text-emerald-600">Rent clear</p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 flex flex-col justify-between border border-zinc-200 dark:border-zinc-800 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Pay Rent</span>
                      <FontAwesomeIcon icon={faWallet} className="text-emerald-500 h-4 w-4" />
                    </div>
                    <div>
                      {nextPayment ? (
                        <div className="space-y-3">
                          <div className="flex flex-col">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <p className="text-lg font-black text-zinc-900 dark:text-white">{formatMoney(nextPayment.amount)}</p>
                              {paymentStatusBadge(nextPayment)}
                            </div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Due {formatDate(nextPayment.dueDate)}</p>
                          </div>
                          {payButtons(nextPayment)}
                        </div>
                      ) : payments.length === 0 ? (
                        <div className="flex items-center gap-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 p-3 text-amber-700 dark:text-amber-500">
                          <FontAwesomeIcon icon={faExclamationCircle} className="h-4 w-4" />
                          <p className="font-bold text-[10px] uppercase tracking-widest">No invoice</p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 p-3 text-emerald-700 dark:text-emerald-500">
                          <FontAwesomeIcon icon={faCheckCircle} className="h-4 w-4" />
                          <p className="font-bold text-[10px] uppercase tracking-widest">All clear</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden mt-2">
                  <div className="grid sm:grid-cols-5 h-full">
                    <div className="sm:col-span-3 p-5 flex flex-col justify-center">
                      <div className="mb-4">
                        <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-md mb-2 inline-block">Current Residence</span>
                        <h2 className="text-xl font-black text-zinc-900 dark:text-white leading-tight">{property.title}</h2>
                        <div className="flex items-center gap-2 text-zinc-500 mt-1 font-bold text-xs">
                          <FontAwesomeIcon icon={faMapMarkerAlt} className="text-zinc-400" />
                          {property.location}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 mb-0.5">Rent Cycle</p>
                          <p className="text-xs font-black text-zinc-900 dark:text-white">Monthly</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 mb-0.5">Lease Status</p>
                          <p className="text-xs font-black text-emerald-600">Active</p>
                        </div>
                      </div>
                    </div>
                    <div className="sm:col-span-2 bg-zinc-50 dark:bg-zinc-950/50 border-l border-zinc-100 dark:border-zinc-800 flex items-center">
                      <div className="p-5 flex flex-col justify-center w-full">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 mb-3">Management</p>
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-white dark:bg-zinc-900 flex items-center justify-center text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                              <FontAwesomeIcon icon={faUser} className="h-3 w-3" />
                            </div>
                            <span className="font-bold text-xs text-zinc-900 dark:text-white">{landlord.displayName}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-white dark:bg-zinc-900 flex items-center justify-center text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                              <FontAwesomeIcon icon={faPhone} className="h-3 w-3" />
                            </div>
                            <span className="font-bold text-xs text-zinc-900 dark:text-white">{landlord.phone || "No phone set"}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="border border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col items-center justify-center text-center rounded-3xl p-12 mb-8 shadow-sm">
                <div className="h-16 w-16 rounded-2xl bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center text-zinc-300 dark:text-zinc-600 mb-4 border border-zinc-100 dark:border-zinc-800">
                  <FontAwesomeIcon icon={faExclamationCircle} className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-black text-zinc-900 dark:text-white mb-1">Pending Assignment</h3>
                <p className="text-zinc-500 font-medium text-sm">Your account is not yet linked to a property.</p>
              </div>
            )}
          </div>
        )}

        {currentTab === 'finances' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-zinc-900 dark:text-white">Payment History</h2>
                <p className="text-xs font-medium text-zinc-500">Receipts are available for cleared rent payments.</p>
              </div>
              <FontAwesomeIcon icon={faReceipt} className="h-5 w-5 text-emerald-500" />
            </div>

            {orderedPayments.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {orderedPayments.map(payment => (
                  <div key={payment.id} className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 shadow-sm">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-base font-black text-zinc-900 dark:text-white">{formatMoney(payment.amount)}</p>
                        {paymentStatusBadge(payment)}
                      </div>
                      <div className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                        <span>Due {formatDate(payment.dueDate)}</span>
                        <span>{payment.paidAt ? `Paid ${formatDate(payment.paidAt)}` : 'Awaiting payment'}</span>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                      {payment.status === 'paid' ? (
                        <a
                          href={getReceiptDownloadUrl(payment)}
                          download={getReceiptFileName(payment)}
                          target={payment.receiptUrl ? '_blank' : undefined}
                          rel={payment.receiptUrl ? 'noreferrer' : undefined}
                          className="inline-flex w-full h-10 items-center justify-center gap-2 rounded-xl bg-zinc-100 px-4 text-xs font-bold text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        >
                          <FontAwesomeIcon icon={payment.receiptUrl ? faExternalLinkAlt : faDownload} className="h-3 w-3" />
                          Receipt
                        </a>
                      ) : (
                        <Button
                          className="w-full h-10 rounded-xl font-black uppercase tracking-widest text-[10px] bg-zinc-900 text-white dark:bg-white dark:text-black"
                          onClick={() => setActiveTab('dashboard')}
                        >
                          Pay Now
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl">
                <FontAwesomeIcon icon={faHistory} className="h-8 w-8 opacity-50 mb-3" />
                <p className="font-bold text-xs">No Payments Found</p>
              </div>
            )}
          </div>
        )}

        {currentTab === 'maintenance' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-zinc-900 dark:text-white">Maintenance History</h2>
                <p className="text-xs font-medium text-zinc-500">Track every ticket sent to management.</p>
              </div>
              <Button className="h-10 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black font-black text-xs px-4" onClick={() => setIsReportOpen(true)}>
                <FontAwesomeIcon icon={faPlus} className="mr-2" /> Request
              </Button>
            </div>

            {requests.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[...requests].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(req => (
                  <div key={req.id} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="font-black text-sm text-zinc-900 dark:text-white">{req.title}</p>
                        <Badge className={`rounded-lg border-none px-2 py-1 font-black text-[8px] uppercase tracking-widest ${
                          req.status === 'resolved' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10' :
                          req.status === 'in-progress' ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10' : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10'
                        }`}>
                          {req.status}
                        </Badge>
                      </div>
                      <p className="text-xs font-medium text-zinc-500 line-clamp-2">{req.description}</p>
                    </div>
                    <div className="mt-4 flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
                      <span className="text-[10px] font-bold text-zinc-400">{formatDate(req.createdAt)}</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{req.priority}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl">
                <FontAwesomeIcon icon={faFileAlt} className="h-8 w-8 opacity-50 mb-3" />
                <p className="font-bold text-xs">No Maintenance History</p>
              </div>
            )}
          </div>
        )}

        {currentTab === 'notices' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-zinc-900 dark:text-white">Notifications</h2>
                <p className="text-xs font-medium text-zinc-500">Rent clearance and upcoming payment notices.</p>
              </div>
              <FontAwesomeIcon icon={faBell} className="text-purple-500 h-5 w-5" />
            </div>

            {noticeItems.length > 0 ? (
              <div className="space-y-3">
                {noticeItems.map(note => (
                  <button
                    key={note.id}
                    className={`w-full flex items-start gap-4 p-4 rounded-2xl border transition-all text-left ${note.read ? 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800' : 'bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 shadow-sm'}`}
                    onClick={() => note.stored && !note.read && markNotificationRead(note.id)}
                  >
                    <div className="h-10 w-10 rounded-xl bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                      <FontAwesomeIcon icon={faBell} />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <h4 className={`text-sm tracking-tight ${note.read ? 'font-bold text-zinc-700 dark:text-zinc-300' : 'font-black text-zinc-900 dark:text-white'}`}>{note.title}</h4>
                        {!note.read && <span className="h-2 w-2 rounded-full bg-zinc-900 dark:bg-white" />}
                      </div>
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 leading-relaxed">{note.message}</p>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-2 block">
                        {formatDate(note.createdAt)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl">
                <FontAwesomeIcon icon={faBell} className="h-8 w-8 opacity-50 mb-3" />
                <p className="font-bold text-xs">No Rent Notices</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Profile Settings Dialog */}
      <Dialog open={isProfileOpen} onOpenChange={setIsProfileOpen}>
        <DialogContent className="sm:max-w-[450px] p-6 rounded-3xl border-none bg-white dark:bg-zinc-900 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">Account Settings</DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 py-2">
            <div className="flex flex-col items-center gap-4">
              <div className="relative h-24 w-24 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 border-4 border-white dark:border-zinc-900 shadow-lg">
                <img src={tenantProfile.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.uid}`} alt="Profile" className="h-full w-full object-cover" />
                <label className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 hover:opacity-100 cursor-pointer transition-opacity">
                  <FontAwesomeIcon icon={faEdit} />
                  <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={isUploading} />
                </label>
              </div>
              {isUploading && <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 animate-pulse">Uploading...</p>}
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Display Name</label>
              <Input className="h-12 rounded-xl" value={tenantProfile.displayName} onChange={e => setTenantProfile({...tenantProfile, displayName: e.target.value})} />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Phone</label>
              <Input className="h-12 rounded-xl" value={tenantProfile.phone} onChange={e => setTenantProfile({...tenantProfile, phone: e.target.value})} />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Address</label>
              <Textarea className="rounded-xl" value={tenantProfile.address} onChange={e => setTenantProfile({...tenantProfile, address: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl font-bold" onClick={() => setIsProfileOpen(false)}>Cancel</Button>
            <Button className="h-10 px-8 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-black" onClick={handleUpdateProfile}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bank Transfer Dialog */}
      <Dialog open={isBankOpen} onOpenChange={setIsBankOpen}>
        <DialogContent className="sm:max-w-[450px] p-0 rounded-3xl border-none bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">
          <div className="bg-blue-600 p-8 text-white">
            <DialogTitle className="text-2xl font-black">Bank Transfer</DialogTitle>
            <DialogDescription className="text-blue-100 font-medium mt-1">Make a manual transfer to the account below.</DialogDescription>
          </div>
          <div className="p-8 space-y-6">
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">Bank Name</p>
                <p className="text-sm font-black text-zinc-900 dark:text-white">{landlord?.bankName || 'Equity Bank / KCB (Default)'}</p>
              </div>
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">Account Name</p>
                <p className="text-sm font-black text-zinc-900 dark:text-white">{landlord?.bankAccountName || landlord?.displayName || 'Property Management'}</p>
              </div>
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">Account Number</p>
                <p className="text-sm font-black text-zinc-900 dark:text-white tracking-wider">{landlord?.bankAccountNumber || '0123456789012'}</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
              <div className="flex gap-3">
                <FontAwesomeIcon icon={faInfoCircle} className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[10px] font-bold text-amber-700 leading-relaxed uppercase tracking-wide">
                  After payment, please send the transaction confirmation to the landlord. Your records will be updated once verified.
                </p>
              </div>
            </div>
          </div>
          <div className="p-8 bg-zinc-50 dark:bg-zinc-800/50 flex justify-end gap-4">
            <Button variant="ghost" className="font-bold rounded-xl" onClick={() => setIsBankOpen(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
