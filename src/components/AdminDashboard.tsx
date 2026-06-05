import { useState, useEffect, useCallback } from 'react';
import { getSubscriptionFeatures } from '../lib/landlordSubscription';
import { supabase } from '../supabase';
import { provisionUser, updateUserStatus, deleteUserAccount } from '../lib/api';
import { UserProfile, UserRole } from '../App';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUsers,
  faShieldAlt,
  faGlobe,
  faPlus,
  faTimesCircle,
  faCheckCircle,
  faChartPie,
  faLink,
  faUserShield,
  faBuilding,
  faSpinner,
  faEye,
  faClipboardList,
  faUser,
  faChevronDown,
  faDownload,
  faChevronLeft,
  faChevronRight,
  faEllipsisVertical,
  faTrash,
  faEdit,
  faSearch,
  faBars,
  faTools,
  faWallet,
  faBolt,
  faCog,
  faTimes,
} from '@fortawesome/free-solid-svg-icons';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UserGrowthLineChart, PlatformRevenueRadial } from './AnalyticsCharts';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Platform {
  id: string;
  name: string;
  slug: string;
  ownerEmail: string;
  status: 'active' | 'suspended';
  createdAt: string;
}

interface AuditLog {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  resource: string | null;
  resourceId: string | null;
  metadata: Record<string, any> | null;
  platformId: string | null;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  LOGIN:                   'bg-emerald-100 text-emerald-700',
  LOGOUT:                  'bg-zinc-100 text-zinc-600',
  PROPERTY_CREATE:         'bg-blue-100 text-blue-700',
  PROPERTY_UPDATE:         'bg-sky-100 text-sky-700',
  PROPERTY_DELETE:         'bg-rose-100 text-rose-700',
  PROPERTY_VIEW:           'bg-violet-100 text-violet-700',
  BOOKING_CREATE:          'bg-indigo-100 text-indigo-700',
  BOOKING_CANCEL:          'bg-orange-100 text-orange-700',
  MAINTENANCE_CREATE:      'bg-amber-100 text-amber-700',
  MAINTENANCE_UPDATE:      'bg-yellow-100 text-yellow-700',
  PAYMENT_MARK_PAID:       'bg-teal-100 text-teal-700',
  TENANT_INVITE:           'bg-pink-100 text-pink-700',
  BUILDING_CREATE:         'bg-cyan-100 text-cyan-700',
  PROFILE_UPDATE:          'bg-purple-100 text-purple-700',
  ADMIN_IMPERSONATE_START: 'bg-amber-200 text-amber-900',
  ADMIN_IMPERSONATE_END:   'bg-zinc-200 text-zinc-700',
};

interface AdminDashboardProps {
  profile: UserProfile;
  onImpersonate?: (user: UserProfile) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function AdminDashboard({ profile, onImpersonate, activeTab, setActiveTab }: AdminDashboardProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [rentPayments, setRentPayments] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);

  // Platform selection for SuperAdmins
  const [selectedPlatformId, setSelectedPlatformId] = useState<string>('all');
  const [isAddPlatformOpen, setIsAddPlatformOpen] = useState(false);
  const [newPlatform, setNewPlatform] = useState({ name: '', slug: '', ownerEmail: '', ownerPassword: '' });
  const [provisionedPlatform, setProvisionedPlatform] = useState<Platform | null>(null);
  const [userPage, setUserPage] = useState(1);
  const usersPerPage = 10;
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [inviteSearch, setInviteSearch] = useState('');
  const [invitePage, setInvitePage] = useState(1);
  const [adminPropertySearch, setAdminPropertySearch] = useState('');
  const [adminPropertyPage, setAdminPropertyPage] = useState(1);
  const [platformSearch, setPlatformSearch] = useState('');
  const [platformPage, setPlatformPage] = useState(1);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditLogPage, setAuditLogPage] = useState(1);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  // Admin capabilities states
  const [isInviteUserOpen, setIsInviteUserOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<{ email: string; displayName: string; password?: string; role: UserRole }>({ email: '', displayName: '', password: '', role: profile.role === 'landlord' ? 'tenant' : 'landlord' });
  const [isAddPropertyOpen, setIsAddPropertyOpen] = useState(false);
  const [propertyForm, setPropertyForm] = useState({ title: '', description: '', type: 'residential', price: '', location: '', landlordId: '', images: '' });
  const [isAddBuildingOpen, setIsAddBuildingOpen] = useState(false);
  const [isEditBuildingOpen, setIsEditBuildingOpen] = useState(false);
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);
  const [buildingForm, setBuildingForm] = useState({ name: '', address: '', landlordId: '' });
  const [editBuildingForm, setEditBuildingForm] = useState({ id: '', name: '', address: '' });
  const [bulkAddForm, setBulkAddForm] = useState({
    landlordId: '',
    buildingId: 'none',
    type: 'residential' as 'residential' | 'commercial' | 'bnb',
    price: '',
    prefix: '',
    startNumber: 1,
    count: 10,
    amenities: '',
    images: '',
  });
  const [isUpdateRoleOpen, setIsUpdateRoleOpen] = useState(false);
  const [selectedUserForRole, setSelectedUserForRole] = useState<any>(null);
  const [updateRoleForm, setUpdateRoleForm] = useState({ role: 'landlord' });
  
  // Property administration states
  const [selectedPropertyToAssign, setSelectedPropertyToAssign] = useState<string | null>(null);
  const [assignLandlordId, setAssignLandlordId] = useState<string>('');
  const [isAssignLandlordOpen, setIsAssignLandlordOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<any>(null);
  const [isEditPropertyOpen, setIsEditPropertyOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [adminProfile, setAdminProfile] = useState({
    displayName: profile.displayName || '',
    phone: profile.phone || '',
    address: profile.address || '',
    avatarUrl: profile.avatarUrl || '',
  });

  // Audit log state (SuperAdmin only)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditUserId, setAuditUserId] = useState<string>('all');
  const [auditLoading, setAuditLoading] = useState(false);

  const fetchAuditLogs = useCallback(async () => {
    if (!profile.isSuperAdmin) return;
    setAuditLoading(true);
    let q = supabase
      .from('audit_logs')
      .select('*')
      .order('createdAt', { ascending: false })
      .limit(200);
    if (auditUserId !== 'all') {
      q = q.eq('userId', auditUserId);
    }
    const { data, error } = await q;
    if (!error && data) setAuditLogs(data as AuditLog[]);
    setAuditLoading(false);
  }, [profile.isSuperAdmin, auditUserId]);

  useEffect(() => {
    let isActive = true;
    const channelToken = `${profile.uid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const fetchAndSubscribe = async () => {
      setLoading(true);

      const listLimit = 200;
      let userQuery = supabase.from('users').select('*').order('createdAt', { ascending: false }).limit(listLimit);
      let propQuery = supabase.from('properties').select('*').order('createdAt', { ascending: false }).limit(listLimit);
      let invQuery  = supabase.from('invitations').select('*').order('createdAt', { ascending: false }).limit(listLimit);
      let payQuery  = supabase.from('rentPayments').select('*').order('dueDate', { ascending: false }).limit(listLimit);
      let bldQuery  = supabase.from('buildings').select('*').order('createdAt', { ascending: false }).limit(listLimit);

      const filterId = profile.isSuperAdmin
        ? (selectedPlatformId === 'all' ? null : selectedPlatformId)
        : (profile.platformId || 'none');

      if (filterId) {
        if (filterId === 'none') {
          userQuery = userQuery.is('platformId', null);
          propQuery = propQuery.is('platformId', null);
          invQuery  = invQuery.is('platformId', null);
          payQuery  = payQuery.is('platformId', null);
          bldQuery  = bldQuery.is('platformId', null);
        } else {
          userQuery = userQuery.eq('platformId', filterId);
          propQuery = propQuery.eq('platformId', filterId);
          invQuery  = invQuery.eq('platformId', filterId);
          payQuery  = payQuery.eq('platformId', filterId);
          bldQuery  = bldQuery.eq('platformId', filterId);
        }
      }

      if (!profile.isSuperAdmin) {
        propQuery = propQuery.eq('landlordId', profile.uid);
        bldQuery = bldQuery.eq('landlordId', profile.uid);
        invQuery = invQuery.eq('landlordId', profile.uid);
        payQuery = payQuery.eq('landlordId', profile.uid);

        const { data: myInvites } = await supabase.from('invitations').select('email').eq('landlordId', profile.uid);
        const allowedEmails = myInvites ? myInvites.map(i => (i.email || '').toLowerCase()) : [];
        if (profile.email) allowedEmails.push(profile.email.toLowerCase());
        
        if (allowedEmails.length > 0) {
          userQuery = userQuery.in('email', allowedEmails);
        }
      }

      const [{ data: userData }, { data: propData }, { data: invData }, { data: payData }, { data: bldData }] = await Promise.all([
        userQuery, propQuery, invQuery, payQuery, bldQuery
      ]);

      const currentUsers = userData || [];
      if (userData) {
        setUsers(userData);
        setUserPage(1);
      }
      if (propData) setProperties(propData);
      if (invData) {
        const registeredEmails = new Set(currentUsers.map((u: any) => (u.email || '').toLowerCase()));
        const activeInvites = invData.filter((inv: any) => !registeredEmails.has((inv.email || '').toLowerCase()));
        setInvitations(activeInvites);
      }
      if (payData)  setRentPayments(payData);
      if (bldData)  setBuildings(bldData);

      if (profile.isSuperAdmin) {
        const { data: platData } = await supabase.from('platforms').select('*');
        if (!isActive) return;
        if (platData) setPlatforms(platData);
      }

      setLoading(false);
    };

    fetchAndSubscribe();

    const channel = supabase.channel(`global-admin-${channelToken}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, fetchAndSubscribe)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'properties' }, fetchAndSubscribe)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platforms' }, fetchAndSubscribe)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rentPayments' }, fetchAndSubscribe)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buildings' }, fetchAndSubscribe)
      .subscribe();

    return () => {
      isActive = false;
      supabase.removeChannel(channel);
    };
  }, [profile.platformId, profile.isSuperAdmin, selectedPlatformId]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  useEffect(() => {
    if (!profile.isSuperAdmin) return;
    const channel = supabase
      .channel('audit-logs-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, () => {
        fetchAuditLogs();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile.isSuperAdmin, fetchAuditLogs]);

  const handleUpdateRole = async () => {
    if (!selectedUserForRole) return;
    try {
      const isSuper = updateRoleForm.role === 'superadmin';
      const roleValue = isSuper ? 'admin' : updateRoleForm.role;
      
      const { error } = await supabase.from('users').update({ 
        role: roleValue,
        isSuperAdmin: isSuper,
        isAdmin: roleValue === 'admin' || isSuper
      }).eq('uid', selectedUserForRole.uid);
      
      if (error) throw error;
      toast.success('Role updated successfully');
      setIsUpdateRoleOpen(false);
      setSelectedUserForRole(null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handlePauseAccount = async (u: any) => {
    const newStatus = u.status === 'suspended' ? 'active' : 'suspended';
    try {
      await updateUserStatus(u.uid, newStatus);
      toast.success(`Account ${newStatus === 'suspended' ? 'paused' : 'unpaused'} successfully`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteAccount = async (u: any) => {
    if (!window.confirm(`Are you sure you want to permanently delete ${u.displayName}?`)) return;
    try {
      await deleteUserAccount(u.uid);
      toast.success('Account deleted successfully');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleBulkDeleteUsers = async () => {
    if (!window.confirm(`Are you sure you want to permanently delete ${selectedUserIds.length} users?`)) return;
    try {
      await Promise.all(selectedUserIds.map(uid => deleteUserAccount(uid)));
      toast.success(`${selectedUserIds.length} accounts deleted successfully`);
      setSelectedUserIds([]);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleBulkPauseUsers = async () => {
    try {
      await Promise.all(
        selectedUserIds.map(uid => {
          const user = users.find(u => u.uid === uid);
          if (user) {
            const newStatus = user.status === 'suspended' ? 'active' : 'suspended';
            return updateUserStatus(uid, newStatus);
          }
          return Promise.resolve();
        })
      );
      toast.success(`${selectedUserIds.length} accounts paused/unpaused successfully`);
      setSelectedUserIds([]);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleBulkExportUsers = () => {
    const selectedUsers = users.filter(u => selectedUserIds.includes(u.uid));
    const csvContent = [
      ['Email', 'Display Name', 'Role', 'Status'].join(','),
      ...selectedUsers.map(u => [u.email, u.displayName, u.role, u.status || 'active'].join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users_export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${selectedUserIds.length} users exported.`);
    setSelectedUserIds([]);
  };

  const toggleUserSelection = (uid: string) => {
    setSelectedUserIds(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  };

  const toggleAllUsers = () => {
    if (selectedUserIds.length === users.length && users.length > 0) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(users.map(u => u.uid));
    }
  };


  const handleInviteUser = async () => {
    if (!inviteForm.email || !inviteForm.displayName) {
      toast.error("Please fill in all required fields.");
      return;
    }
    try {
      const targetPlatformId = profile.isSuperAdmin ? (selectedPlatformId === 'all' ? null : selectedPlatformId) : profile.platformId;
      
      const result = await provisionUser({
        email: inviteForm.email.toLowerCase(),
        password: inviteForm.password,
        displayName: inviteForm.displayName,
        role: inviteForm.role,
        platformId: targetPlatformId,
        landlordId: profile.uid,
        mustChangePassword: true,
      });

      if (result.invitation) {
        setInvitations(prev => {
          const exists = prev.some(i => i.email.toLowerCase() === result.email.toLowerCase());
          if (exists) {
            return prev.map(i => i.email.toLowerCase() === result.email.toLowerCase() ? result.invitation : i);
          }
          return [...prev, result.invitation];
        });
      }

      toast.success("User created and invited successfully!");
      setIsInviteUserOpen(false);
      setInviteForm({ email: '', displayName: '', password: '', role: 'landlord' });
    } catch (err: any) {
      toast.error(err.message || "Failed to create user");
    }
  };

  const handleAddBuilding = async () => {
    if (!buildingForm.name || !buildingForm.landlordId) {
      toast.error("Please fill in all required fields.");
      return;
    }
    try {
      const targetPlatformId = profile.isSuperAdmin ? (selectedPlatformId === 'all' ? null : selectedPlatformId) : profile.platformId;
      const { error } = await supabase.from('buildings').insert([{
        name: buildingForm.name,
        address: buildingForm.address,
        landlordId: buildingForm.landlordId,
        platformId: targetPlatformId
      }]);
      if (error) throw error;
      toast.success("Building added successfully!");
      setIsAddBuildingOpen(false);
      setBuildingForm({ name: '', address: '', landlordId: '' });
    } catch (err: any) {
      toast.error(err.message);
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
      toast.success("Asset group updated!");
      setIsEditBuildingOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to update asset group");
    }
  };

  const handleDeleteBuilding = async (id: string) => {
    if (!confirm("Are you sure you want to delete this asset group? ALL units inside and their associated tenant accounts will be PERMANENTLY deleted.")) return;
    try {
      // 1. Fetch properties in this building
      const { data: bldProps } = await supabase.from('properties').select('id, tenantId').eq('buildingId', id);
      
      if (bldProps && bldProps.length > 0) {
        // 2. Find tenants to delete
        const tenantEmails = bldProps.map(p => p.tenantId).filter(email => email);
        
        if (tenantEmails.length > 0) {
           const { data: tenantUsers } = await supabase.from('users').select('uid').in('email', tenantEmails);
           if (tenantUsers) {
              await Promise.all(tenantUsers.map(user => deleteUserAccount(user.uid)));
           }
        }
        
        // 3. Delete the properties
        const propIds = bldProps.map(p => p.id);
        await supabase.from('properties').delete().in('id', propIds);
      }

      const { error } = await supabase.from('buildings').delete().eq('id', id);
      if (error) throw error;
      setBuildings(prev => prev.filter(b => b.id !== id));
      setProperties(prev => prev.filter(p => p.buildingId !== id));
      toast.success("Asset group, units, and tenant accounts deleted successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete asset group");
    }
  };

  const handleAddProperty = async () => {
    if (!propertyForm.title || !propertyForm.price || !propertyForm.location || !propertyForm.landlordId) {
      toast.error("Please fill in all required fields.");
      return;
    }

    // Check landlord subscription limit
    const landlord = users.find(u => u.uid === propertyForm.landlordId);
    if (landlord) {
      const landlordPropertiesCount = properties.filter(p => p.landlordId === landlord.uid).length;
      const features = getSubscriptionFeatures(landlord);
      if (features.maxListings != null && landlordPropertiesCount >= features.maxListings) {
        toast.error(`Landlord ${landlord.displayName} has reached their plan limit of ${features.maxListings} listings.`);
        return;
      }
    }

    try {
      const targetPlatformId = profile.isSuperAdmin ? (selectedPlatformId === 'all' ? null : selectedPlatformId) : profile.platformId;
      if (!targetPlatformId && profile.isSuperAdmin && selectedPlatformId === 'all') {
        toast.error("Please select a specific platform before adding a property.");
        return;
      }
      const imagesArr = propertyForm.images ? propertyForm.images.split(',').map(url => url.trim()).filter(url => url) : [];
      const { error } = await supabase.from('properties').insert([{
        title: propertyForm.title,
        description: propertyForm.description,
        type: propertyForm.type,
        price: Number(propertyForm.price),
        location: propertyForm.location,
        landlordId: propertyForm.landlordId,
        platformId: targetPlatformId,
        images: imagesArr,
        status: 'available',
        createdAt: new Date().toISOString()
      }]);
      if (error) throw error;
      toast.success("Property added successfully!");
      setIsAddPropertyOpen(false);
      setPropertyForm({ title: '', description: '', type: 'residential', price: '', location: '', landlordId: '', images: '' });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleBulkAddProperties = async () => {
    if (!bulkAddForm.landlordId) {
      toast.error('Please select a landlord');
      return;
    }

    // Check landlord subscription limit
    const landlord = users.find(u => u.uid === bulkAddForm.landlordId);
    if (landlord) {
      const landlordPropertiesCount = properties.filter(p => p.landlordId === landlord.uid).length;
      const features = getSubscriptionFeatures(landlord);
      if (features.maxListings != null && landlordPropertiesCount + bulkAddForm.count > features.maxListings) {
        toast.error(`Landlord ${landlord.displayName} can only add ${features.maxListings - landlordPropertiesCount} more units on their current plan.`);
        return;
      }
    }

    if (bulkAddForm.buildingId === 'none') {
      toast.error('Please select a building');
      return;
    }
    const building = buildings.find(b => b.id === bulkAddForm.buildingId);
    if (!building) return;

    try {
      const targetPlatformId = profile.isSuperAdmin ? (selectedPlatformId === 'all' ? null : selectedPlatformId) : profile.platformId;
      if (!targetPlatformId && profile.isSuperAdmin && selectedPlatformId === 'all') {
        toast.error("Please select a specific platform before adding properties.");
        return;
      }
      
      const inserts = [];
      for (let i = 0; i < bulkAddForm.count; i++) {
        const unitNum = `${bulkAddForm.prefix}${Number(bulkAddForm.startNumber) + i}`;
        inserts.push({
          landlordId: bulkAddForm.landlordId,
          platformId: targetPlatformId,
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
      setBulkAddForm({ landlordId: '', buildingId: 'none', type: 'residential', price: '', prefix: '', startNumber: 1, count: 10, amenities: '', images: '' });
    } catch (error) {
      toast.error('Failed to create units in bulk');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const uploadedUrls: string[] = [];
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = `${profile.uid}/${Date.now()}-${i}.${file.name.split('.').pop()}`;
        const { error } = await supabase.storage
          .from('properties')
          .upload(fileName, file);

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('properties')
          .getPublicUrl(fileName);

        uploadedUrls.push(publicUrl);
      }

      setPropertyForm(prev => ({
        ...prev,
        images: [...(prev.images || '').split(',').filter(x => x), ...uploadedUrls].join(', ')
      }));
      toast.success("Images uploaded successfully!");
    } catch (error) {
      toast.error("Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleEditImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const uploadedUrls: string[] = [];
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = `${profile.uid}/${Date.now()}-${i}.${file.name.split('.').pop()}`;
        const { error } = await supabase.storage
          .from('properties')
          .upload(fileName, file);

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('properties')
          .getPublicUrl(fileName);

        uploadedUrls.push(publicUrl);
      }

      setEditingProperty((prev: any) => {
        if (!prev) return null;
        return {
          ...prev,
          images: [...(prev.images || []), ...uploadedUrls]
        };
      });
      toast.success("Images uploaded successfully!");
    } catch (error) {
      toast.error("Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteProperty = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this property?")) return;
    try {
      const { error } = await supabase.from('properties').delete().eq('id', id);
      if (error) throw error;
      toast.success("Property deleted successfully!");
      setProperties(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAssignPropertyLandlord = async () => {
    if (!selectedPropertyToAssign || !assignLandlordId) return;
    try {
      const { error } = await supabase
        .from('properties')
        .update({ landlordId: assignLandlordId })
        .eq('id', selectedPropertyToAssign);
      
      if (error) throw error;
      toast.success("Landlord assigned successfully!");
      setProperties(prev => prev.map(p => p.id === selectedPropertyToAssign ? { ...p, landlordId: assignLandlordId } : p));
      setIsAssignLandlordOpen(false);
      setSelectedPropertyToAssign(null);
      setAssignLandlordId('');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleUpdateProperty = async () => {
    if (!editingProperty) return;
    try {
      const { id, ...data } = editingProperty;
      const payload = {
        title: data.title,
        description: data.description,
        type: data.type,
        price: Number(data.price),
        location: data.location,
        landlordId: data.landlordId,
        images: Array.isArray(data.images) ? data.images : (data.images || '').split(',').map((url: any) => url.trim()).filter((url: any) => url)
      };
      const { error } = await supabase.from('properties').update(payload).eq('id', id);
      if (error) throw error;
      toast.success("Property updated successfully!");
      setProperties(prev => prev.map(p => p.id === id ? { ...p, ...payload } : p));
      setIsEditPropertyOpen(false);
      setEditingProperty(null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAddPlatform = async () => {
    if (!newPlatform.name || !newPlatform.slug || !newPlatform.ownerEmail || !newPlatform.ownerPassword) {
      toast.error("Please fill in all required fields.");
      return;
    }
    if (newPlatform.ownerPassword.length < 8) {
      toast.error("Temporary password must be at least 8 characters long.");
      return;
    }
    try {
      // 1. Insert and retrieve the new platform row
      const { data: newPlat, error } = await supabase
        .from('platforms')
        .insert([{
          name: newPlatform.name,
          slug: newPlatform.slug,
          ownerEmail: newPlatform.ownerEmail.toLowerCase()
        }])
        .select()
        .single();
      
      if (error) throw error;
      
      const createdPlat = newPlat as Platform;

      // 2. If newPlatform.ownerEmail is specified, create an admin invitation linked to this platform
      if (createdPlat && newPlatform.ownerEmail) {
        const { error: inviteError } = await supabase
          .from('invitations')
          .insert([{
            email: newPlatform.ownerEmail.toLowerCase(),
            displayName: newPlatform.name + ' Owner',
            role: 'admin',
            platformId: createdPlat.id,
            createdAt: new Date().toISOString()
          }]);
        
        if (inviteError) {
          console.error("Admin invitation insertion error:", inviteError);
        }

        try {
          await provisionUser({
            email: newPlatform.ownerEmail.toLowerCase(),
            password: newPlatform.ownerPassword,
            displayName: `${newPlatform.name} Owner`,
            role: 'admin',
            platformId: createdPlat.id,
            mustChangePassword: true,
          });
        } catch (signUpError: any) {
          console.error('Master Admin auth registration error:', signUpError);
          toast.error(`Auth creation failed: ${signUpError.message}`);
        }
      }

      toast.success("Platform provisioned successfully! Master Admin account created.");
      
      // Update local state synchronously to react instantly
      setPlatforms(prev => [...prev, createdPlat]);
      setProvisionedPlatform(createdPlat);
      setIsAddPlatformOpen(false);
      setNewPlatform({ name: '', slug: '', ownerEmail: '', ownerPassword: '' });
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleUpdateProfile = async () => {
    try {
      const { error } = await supabase.from('users').update(adminProfile).eq('uid', profile.uid);
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
      setAdminProfile({ ...adminProfile, avatarUrl: publicUrl });
    } catch (error) {
      toast.error("Failed to upload profile picture");
    } finally {
      setIsUploading(false);
    }
  };

  const togglePlatformStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      const { error } = await supabase.from('platforms').update({ status: newStatus }).eq('id', id);
      if (error) throw error;
      toast.success(`Platform ${newStatus}`);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const exportAuditCSV = () => {
    const rows = auditLogs.map(l => [
      new Date(l.createdAt).toISOString(),
      l.userEmail,
      l.action,
      l.resource ?? '',
      l.resourceId ?? '',
      JSON.stringify(l.metadata ?? {}),
    ]);
    const header = ['Timestamp', 'User Email', 'Action', 'Resource', 'Resource ID', 'Metadata'];
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && platforms.length === 0 && users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="relative">
          <div className="absolute inset-0 rounded-2xl bg-zinc-100/80 blur-lg animate-pulse scale-150" />
          <img src="/bomalog.webp" alt="myboma" className="relative h-12 w-12 object-contain rounded-xl animate-logo-reveal" width="48" height="48" />
        </div>
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.3em]">Accessing Secure Core...</p>
      </div>
    );
  }

  // Dynamically map users to growth coordinates if they have createdAt
  const userTimelinePoints = (() => {
    try {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const counts: Record<string, number> = {};
      
      const now = new Date();
      const last6Months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = months[d.getMonth()];
        last6Months.push(label);
        counts[label] = 0;
      }

      let validCount = 0;
      users.forEach(u => {
        const dateStr = (u as any).createdAt || (u as any).created_at;
        if (dateStr) {
          const d = new Date(dateStr);
          const label = months[d.getMonth()];
          if (counts[label] !== undefined) {
            counts[label]++;
            validCount++;
          }
        }
      });

      if (validCount > 0) {
        let sum = users.length - validCount;
        if (sum < 0) sum = 0;
        return last6Months.map(label => {
          sum += counts[label];
          return { label, value: sum };
        });
      }
    } catch (e) {
      console.warn("Failed parsing user signup timeline", e);
    }
    return [];
  })();

  const defaultPoints = [
    { label: 'Dec', value: 5 },
    { label: 'Jan', value: 12 },
    { label: 'Feb', value: 20 },
    { label: 'Mar', value: 32 },
    { label: 'Apr', value: 48 },
    { label: 'May', value: users.length || 55 }
  ];
  const displayPoints = userTimelinePoints && userTimelinePoints.length >= 6 ? userTimelinePoints.slice(-6) : defaultPoints;
  const maxValPoints = Math.max(...displayPoints.map(p => p.value), 1);
  const pointsWithHeights = displayPoints.map(p => ({
    ...p,
    height: `${Math.round((p.value / maxValPoints) * 100)}%`,
    isMax: p.value === maxValPoints
  }));

  // Pagination calculations - User Registry
  const filteredUsers = users.filter(u => {
    const search = userSearch.toLowerCase();
    const platName = platforms.find(p => p.id === u.platformId)?.name || 'ROOT';
    const matchesSearch = (
      (u.displayName || '').toLowerCase().includes(search) ||
      (u.email || '').toLowerCase().includes(search) ||
      (u.role || '').toLowerCase().includes(search) ||
      platName.toLowerCase().includes(search)
    );
    const matchesRole = userRoleFilter === 'all' || u.role === userRoleFilter;
    return matchesSearch && matchesRole;
  });
  const indexOfLastUser = userPage * usersPerPage;
  const indexOfFirstUser = indexOfLastUser - usersPerPage;
  const currentUsers = filteredUsers.slice(indexOfFirstUser, indexOfLastUser);
  const totalUserPages = Math.ceil(filteredUsers.length / usersPerPage);

  // Pagination calculations - Invitations (Awaiting Auth)
  const filteredInvs = invitations.filter(inv => {
    const search = inviteSearch.toLowerCase();
    const platName = platforms.find(p => p.id === inv.platformId)?.name || 'EXTERNAL';
    return (
      (inv.displayName || '').toLowerCase().includes(search) ||
      (inv.email || '').toLowerCase().includes(search) ||
      (inv.role || '').toLowerCase().includes(search) ||
      platName.toLowerCase().includes(search)
    );
  });
  const totalInvitePages = Math.ceil(filteredInvs.length / 10);
  const paginatedInvs = filteredInvs.slice(
    (invitePage - 1) * 10,
    invitePage * 10
  );

  // Pagination calculations - Properties Assets
  const filteredProps = properties.filter(p => {
    const search = adminPropertySearch.toLowerCase();
    const platName = platforms.find(plat => plat.id === p.platformId)?.name || 'ROOT';
    return (
      (p.title || '').toLowerCase().includes(search) ||
      (p.location || '').toLowerCase().includes(search) ||
      String(p.price || '').includes(search) ||
      (p.status || '').toLowerCase().includes(search) ||
      platName.toLowerCase().includes(search)
    );
  });
  const totalAdminPropertyPages = Math.ceil(filteredProps.length / 10);
  const paginatedProps = filteredProps.slice(
    (adminPropertyPage - 1) * 10,
    adminPropertyPage * 10
  );

  // Pagination calculations - Platform Leases
  const filteredPlats = platforms.filter(plat => {
    const search = platformSearch.toLowerCase();
    return (
      (plat.name || '').toLowerCase().includes(search) ||
      (plat.slug || '').toLowerCase().includes(search) ||
      (plat.ownerEmail || '').toLowerCase().includes(search) ||
      (plat.status || '').toLowerCase().includes(search)
    );
  });
  const totalPlatformPages = Math.ceil(filteredPlats.length / 10);
  const paginatedPlats = filteredPlats.slice(
    (platformPage - 1) * 10,
    platformPage * 10
  );

  // Pagination calculations - Audit Logs
  const filteredAudits = auditLogs.filter(log => {
    const search = auditSearch.toLowerCase();
    return (
      (log.userEmail || '').toLowerCase().includes(search) ||
      (log.action || '').toLowerCase().includes(search) ||
      (log.resource || '').toLowerCase().includes(search) ||
      (log.resourceId || '').toLowerCase().includes(search)
    );
  });
  const totalAuditLogPages = Math.ceil(filteredAudits.length / 15);
  const paginatedAudits = filteredAudits.slice(
    (auditLogPage - 1) * 15,
    auditLogPage * 15
  );

  return (
    <div className="db min-h-screen pb-12 animate-in fade-in duration-700">
      {/* Hero Page Header */}
      <div className="hero">
        <div className="hero-meta">
          <span className="lvl-badge">Level 4 access</span>
          <div className="status-dot">
            <span className="status-pulse"></span>
            System online
          </div>
        </div>
        <div className="hero-row">
          <div>
            <h1 className="hero-title">{profile.isSuperAdmin ? 'Command Center' : 'Platform Control'}</h1>
            <p className="hero-sub">
              {profile.isSuperAdmin 
                ? 'Global node management across all instances.' 
                : `Administrative dashboard for your platform lease.`}
            </p>
          </div>
          <div className="hero-actions">
            <Button variant="link" size="sm" className="h-auto p-0 text-zinc-500 font-black uppercase tracking-widest text-[10px] hover:text-zinc-900 mr-4" onClick={() => setIsProfileOpen(true)}>
              Secure Profile
            </Button>
            {profile.isSuperAdmin && (
              <>
                <div className="relative">
                  <select
                    className="btn-ghost appearance-none pr-8 cursor-pointer font-semibold"
                    value={selectedPlatformId}
                    onChange={(e) => setSelectedPlatformId(e.target.value)}
                  >
                    <option value="all">Global view</option>
                    {platforms.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none text-[10px]">▼</span>
                </div>

                <Dialog open={isAddPlatformOpen} onOpenChange={setIsAddPlatformOpen}>
                  <DialogTrigger render={<button className="btn-primary" />}>
                    <i className="ti ti-plus mr-1"></i> New instance
                  </DialogTrigger>
                  <DialogContent className="rounded-3xl border-none shadow-2xl bg-white dark:bg-zinc-900">
                    <DialogHeader>
                      <DialogTitle className="text-2xl font-black text-zinc-900 dark:text-white">Provision New Platform</DialogTitle>
                      <DialogDescription className="font-medium text-zinc-500">Configure a new secure lease and master admin credentials.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-6 py-6">
                      <div className="grid gap-2">
                        <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Business Name *</label>
                        <Input className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800" value={newPlatform.name} onChange={e => setNewPlatform({...newPlatform, name: e.target.value})} placeholder="Acme Real Estate" />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Unique Slug *</label>
                        <Input className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800" value={newPlatform.slug} onChange={e => setNewPlatform({...newPlatform, slug: e.target.value.toLowerCase().replace(/\s+/g, '-')})} placeholder="acme-prop" />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Master Admin Email *</label>
                        <Input className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800" value={newPlatform.ownerEmail} onChange={e => setNewPlatform({...newPlatform, ownerEmail: e.target.value})} placeholder="admin@acme.com" />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Master Admin Temporary Password *</label>
                        <Input className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800" type="password" value={newPlatform.ownerPassword} onChange={e => setNewPlatform({...newPlatform, ownerPassword: e.target.value})} placeholder="••••••" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="ghost" className="font-bold rounded-xl h-12" onClick={() => setIsAddPlatformOpen(false)}>Abort</Button>
                      <Button className="font-black rounded-xl h-12 px-8 bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-900" onClick={handleAddPlatform}>Initiate Provision</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog open={!!provisionedPlatform} onOpenChange={(open) => { if (!open) setProvisionedPlatform(null); }}>
                  <DialogContent className="rounded-3xl border-none shadow-2xl sm:max-w-[550px] p-0 overflow-hidden bg-white dark:bg-zinc-900">
                    <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-8 text-white relative">
                      <div className="absolute top-4 right-4 h-10 w-10 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer transition-colors" onClick={() => setProvisionedPlatform(null)}>
                        <FontAwesomeIcon icon={faTimesCircle} className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex items-center gap-4 mb-4">
                        <div className="h-14 w-14 rounded-2xl bg-white flex items-center justify-center text-indigo-600 shadow-xl">
                          <FontAwesomeIcon icon={faCheckCircle} className="h-8 w-8 text-emerald-500" />
                        </div>
                        <div>
                          <Badge className="bg-emerald-500/20 text-emerald-300 border-none px-3 py-1 font-black text-[9px] uppercase tracking-widest">
                            Successfully Leased
                          </Badge>
                          <h3 className="text-2xl font-black tracking-tight mt-1">{provisionedPlatform?.name}</h3>
                        </div>
                      </div>
                      <p className="text-indigo-100 text-xs font-semibold leading-relaxed">
                        The tenant platform instance has been fully provisioned on the network. Master administrative credentials and invitations are active.
                      </p>
                    </div>
                    <div className="p-6 md:p-8 space-y-6 bg-white dark:bg-zinc-900">
                      <div className="space-y-4">
                        <div className="flex items-start gap-4 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                          <div className="h-10 w-10 rounded-xl bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 shrink-0">
                            <FontAwesomeIcon icon={faGlobe} className="h-4 w-4" />
                          </div>
                          <div className="space-y-0.5 min-w-0 flex-1">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Access Directory / Custom URL</h4>
                            <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                              {window.location.origin}/p/{provisionedPlatform?.slug}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start gap-4 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                          <div className="h-10 w-10 rounded-xl bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 shrink-0">
                            <FontAwesomeIcon icon={faUserShield} className="h-4 w-4" />
                          </div>
                          <div className="space-y-0.5 min-w-0 flex-1">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Master Admin Assignee</h4>
                            <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                              {provisionedPlatform?.ownerEmail}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 p-4 flex gap-3 text-amber-900 dark:text-amber-300">
                        <FontAwesomeIcon icon={faCheckCircle} className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-black uppercase tracking-wider text-[10px] text-amber-800 dark:text-amber-400">🔑 Onboarding Instructions</p>
                          <p className="text-xs font-semibold leading-relaxed text-amber-700 dark:text-amber-300/80">
                            The platform lease admin has been registered with the temporary password you specified. Provide them with the custom URL link above and their credentials to sign in and begin.
                          </p>
                        </div>
                      </div>

                      <Button className="w-full h-12 rounded-2xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white text-white dark:text-zinc-900 font-black text-sm transition-all shadow-xl" onClick={() => setProvisionedPlatform(null)}>
                        Complete Onboarding
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Dashboard Overview ── */}
      {(activeTab === 'dashboard' || !activeTab) && (
        <>
          {/* Stat Cards Grid */}
          <div className="stats-grid animate-in fade-in duration-500">
            {/* Active Nodes */}
            <div className="stat-card">
              <div className="stat-top">
                <span className="stat-label">Active Nodes</span>
                <div className="stat-icon si-blue">
                  <i className="ti ti-users"></i>
                </div>
              </div>
              <div className="stat-num">{users.length}</div>
              <div className="stat-desc">Registered users</div>
              <div className="stat-bar bar-blue"></div>
            </div>

            {/* Awaiting Auth */}
            <div className="stat-card">
              <div className="stat-top">
                <span className="stat-label">Awaiting Auth</span>
                <div className="stat-icon si-amber">
                  <i className="ti ti-link"></i>
                </div>
              </div>
              <div className="stat-num">{invitations.length}</div>
              <div className="stat-desc">Pending invites</div>
              <div className="stat-bar bar-amber"></div>
            </div>

            {/* Assets Indexed */}
            <div className="stat-card">
              <div className="stat-top">
                <span className="stat-label">Assets Indexed</span>
                <div className="stat-icon si-teal">
                  <i className="ti ti-building"></i>
                </div>
              </div>
              <div className="stat-num">{properties.length}</div>
              <div className="stat-desc">Total properties</div>
              <div className="stat-bar bar-teal"></div>
            </div>

            {/* Total Revenue */}
            <div className="stat-card">
              <div className="stat-top">
                <span className="stat-label">Total Revenue</span>
                <div className="stat-icon si-emerald">
                  <i className="ti ti-cash"></i>
                </div>
              </div>
              <div className="stat-num">KES {rentPayments.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.amount || 0), 0).toLocaleString()}</div>
              <div className="stat-desc">Across all properties</div>
              <div className="stat-bar bar-emerald"></div>
            </div>

            {/* Network Load */}
            {profile.isSuperAdmin && (
              <div className="stat-card">
                <div className="stat-top">
                  <span className="stat-label">Network Load</span>
                  <div className="stat-icon si-red">
                    <i className="ti ti-server"></i>
                  </div>
                </div>
                <div className="stat-num">{platforms.length}</div>
                <div className="stat-desc">Platform leases</div>
                <div className="stat-bar bar-red"></div>
              </div>
            )}
          </div>

          {/* Panels / Charts */}
          <div className="panels animate-in fade-in duration-500">
            {/* Left Panel: Platform Growth */}
            <div className="panel">
              <div className="panel-header">
                <div>
                  <div className="panel-meta">
                    <i className="ti ti-chart-line"></i> Platform Growth
                  </div>
                  <div className="panel-title">System registrations</div>
                </div>
                <div className="growth-chip">
                  <i className="ti ti-arrow-up-right mr-0.5"></i> +48.2% MoM
                </div>
              </div>
              
              {/* Bar Chart */}
              <div className="bar-chart">
                {pointsWithHeights.map((p, idx) => (
                  <div className="bc-col" key={idx}>
                    <div className={`bc-bar ${p.isMax ? 'hi' : ''}`} style={{ height: p.height }}></div>
                    <span className="bc-lbl">{p.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Panel: Platform Allocation */}
            <div className="panel">
              <div className="panel-header">
                <div>
                  <div className="panel-meta">
                    <i className="ti ti-chart-pie"></i> Financial Telemetry
                  </div>
                  <div className="panel-title">Platform allocation</div>
                </div>
              </div>

              {/* Donut Chart + Legend */}
              <div className="donut-wrap">
                <svg width="80" height="80" viewBox="0 0 80 80" className="flex-shrink-0">
                  {/* Circumference for radius 28 is 2 * pi * 28 = ~175.93 */}
                  <circle cx="40" cy="40" r="28" fill="transparent" stroke="#e2e8f0" strokeWidth="8" />
                  
                  {/* Blue segment (Residential - 50%): length 88, offset 0 */}
                  <circle cx="40" cy="40" r="28" fill="transparent" stroke="#378add" strokeWidth="8"
                          strokeDasharray="88 176" strokeDashoffset="0" transform="rotate(-90 40 40)" />
                          
                  {/* Teal segment (Commercial - 25%): length 44, offset -88 */}
                  <circle cx="40" cy="40" r="28" fill="transparent" stroke="#1d9e75" strokeWidth="8"
                          strokeDasharray="44 176" strokeDashoffset="-88" transform="rotate(-90 40 40)" />
                          
                  {/* Amber segment (Industrial - 14%): length 24.6, offset -132 */}
                  <circle cx="40" cy="40" r="28" fill="transparent" stroke="#ef9f27" strokeWidth="8"
                          strokeDasharray="24.6 176" strokeDashoffset="-132" transform="rotate(-90 40 40)" />
                          
                  {/* Light blue/gray segment (Vacant - 11%): length 19.4, offset -156.6 */}
                  <circle cx="40" cy="40" r="28" fill="transparent" stroke="#cbd5e1" strokeWidth="8"
                          strokeDasharray="19.4 176" strokeDashoffset="-156.6" transform="rotate(-90 40 40)" />
                </svg>
                
                <div className="legend">
                  <div className="leg-item">
                    <span className="leg-dot" style={{ backgroundColor: '#378add' }}></span>
                    Residential
                    <span className="leg-val">50%</span>
                  </div>
                  <div className="leg-item">
                    <span className="leg-dot" style={{ backgroundColor: '#1d9e75' }}></span>
                    Commercial
                    <span className="leg-val">25%</span>
                  </div>
                  <div className="leg-item">
                    <span className="leg-dot" style={{ backgroundColor: '#ef9f27' }}></span>
                    Industrial
                    <span className="leg-val">14%</span>
                  </div>
                  <div className="leg-item">
                    <span className="leg-dot" style={{ backgroundColor: '#cbd5e1' }}></span>
                    Vacant
                    <span className="leg-val">11%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Tab Panels */}
      <div className="px-6 mt-4">
        {/* ── USERS TAB ── */}
        {activeTab === 'registered' && (
          <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:bg-zinc-900 rounded-3xl overflow-hidden">
            <CardHeader className="p-4 sm:p-8 border-b border-zinc-50 dark:border-zinc-800">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-xl font-black">User Registry</CardTitle>
                  <CardDescription className="font-medium">Managing all verified network identities.</CardDescription>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                    <div className="relative w-full sm:max-w-xs">
                      <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-400" />
                      <Input 
                        placeholder="Search users..." 
                        className="h-9 pl-8 text-xs font-bold rounded-xl border-zinc-200" 
                        value={userSearch} 
                        onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }} 
                      />
                    </div>
                    <select
                      className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
                      value={userRoleFilter}
                      onChange={(e) => { setUserRoleFilter(e.target.value); setUserPage(1); }}
                    >
                      <option value="all">All Roles</option>
                      <option value="admin">Admins</option>
                      <option value="landlord">Landlords</option>
                      <option value="tenant">Tenants</option>
                      <option value="hunter">Hunters</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Dialog open={isInviteUserOpen} onOpenChange={setIsInviteUserOpen}>
                      <DialogTrigger render={<Button className="rounded-xl font-bold bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950" />}>
                        <FontAwesomeIcon icon={faPlus} className="mr-2 h-3 w-3" />
                        Invite User
                      </DialogTrigger>
                    <DialogContent className="rounded-3xl border-none shadow-2xl bg-white dark:bg-zinc-900">
                      <DialogHeader>
                        <DialogTitle className="text-xl font-black">Invite New User</DialogTitle>
                        <DialogDescription className="font-medium text-zinc-500">Send an invitation to join a specific platform.</DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        {profile.isSuperAdmin && (
                          <div className="grid gap-2">
                            <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Platform</label>
                            <select
                              className="h-12 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
                              value={selectedPlatformId}
                              onChange={(e) => setSelectedPlatformId(e.target.value)}
                            >
                              <option value="all">None (Global User)</option>
                              {platforms.map((platform) => (
                                <option key={platform.id} value={platform.id}>{platform.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="grid gap-2">
                          <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Display Name</label>
                          <Input className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800" value={inviteForm.displayName} onChange={e => setInviteForm({...inviteForm, displayName: e.target.value})} placeholder="John Doe" />
                        </div>
                        <div className="grid gap-2">
                          <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Email Address</label>
                          <Input className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800" type="email" value={inviteForm.email} onChange={e => setInviteForm({...inviteForm, email: e.target.value})} placeholder="john@example.com" />
                        </div>
                        <div className="grid gap-2">
                          <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Temporary Password</label>
                          <Input className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800" type="password" value={inviteForm.password} onChange={e => setInviteForm({...inviteForm, password: e.target.value})} placeholder="Set a temporary password" />
                        </div>
                        <div className="grid gap-2">
                          <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Role</label>
                          <select className="h-12 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 text-sm font-semibold focus:ring-2 focus:ring-zinc-400 outline-none" value={inviteForm.role} onChange={e => setInviteForm({...inviteForm, role: e.target.value as UserRole})}>
                            <option value="landlord">Landlord</option>
                            <option value="tenant">Tenant</option>
                            <option value="hunter">Hunter</option>
                            {(profile.isSuperAdmin || profile.isAdmin) && <option value="admin">Platform Admin</option>}
                          </select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="ghost" className="font-bold rounded-xl h-12" onClick={() => setIsInviteUserOpen(false)}>Cancel</Button>
                        <Button
                          className="font-black rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-900 h-12 px-6"
                          onClick={handleInviteUser}
                        >
                          Send Invite
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={isUpdateRoleOpen} onOpenChange={setIsUpdateRoleOpen}>
                    <DialogContent className="rounded-3xl border-none shadow-2xl bg-white dark:bg-zinc-900">
                      <DialogHeader>
                        <DialogTitle className="text-xl font-black">Update User Role</DialogTitle>
                        <DialogDescription className="font-medium text-zinc-500">Change the access level for {selectedUserForRole?.displayName}.</DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <label className="text-xs font-black uppercase tracking-widest text-zinc-400">New Role</label>
                          <select className="h-12 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 text-sm font-semibold focus:ring-2 focus:ring-zinc-400 outline-none" value={updateRoleForm.role} onChange={e => setUpdateRoleForm({ role: e.target.value })}>
                            <option value="landlord">Landlord</option>
                            <option value="tenant">Tenant</option>
                            <option value="hunter">Hunter</option>
                            {(profile.isSuperAdmin || profile.isAdmin) && <option value="admin">Platform Admin</option>}
                            {profile.isSuperAdmin && <option value="superadmin">Super Admin</option>}
                          </select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="ghost" className="font-bold rounded-xl h-12" onClick={() => setIsUpdateRoleOpen(false)}>Cancel</Button>
                        <Button className="font-black rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-900 h-12 px-6" onClick={handleUpdateRole}>Update Role</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Button variant="outline" className="rounded-xl font-bold">Export CSV</Button>
                </div>
              </div>
            </div>
          </CardHeader>
            <CardContent className="p-0">
              {selectedUserIds.length > 0 && (
                <div className="flex items-center gap-4 bg-zinc-100 dark:bg-zinc-800 p-4 rounded-xl mx-4 mt-4 mb-4">
                  <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300">{selectedUserIds.length} selected</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={handleBulkExportUsers} className="h-8 text-[10px] font-black uppercase tracking-widest">Export</Button>
                    <Button size="sm" variant="outline" onClick={handleBulkPauseUsers} className="h-8 text-[10px] font-black uppercase tracking-widest text-amber-600">Pause / Unpause</Button>
                    <Button size="sm" variant="outline" onClick={handleBulkDeleteUsers} className="h-8 text-[10px] font-black uppercase tracking-widest text-rose-600 border-rose-200">Delete</Button>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto overflow-y-auto max-h-[500px] relative">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-zinc-50/50 dark:bg-zinc-800/50 hover:bg-transparent border-none">
                      <TableHead className="w-12 px-4"><Checkbox checked={currentUsers.length > 0 && selectedUserIds.length === currentUsers.length} onCheckedChange={toggleAllUsers} /></TableHead>
                      <TableHead className="px-4 py-3 sm:px-8 sm:py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Entity Name</TableHead>
                      <TableHead className="px-4 py-3 sm:py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400 hidden sm:table-cell">Email</TableHead>
                      <TableHead className="px-4 py-3 sm:py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Access Level</TableHead>
                      {profile.isSuperAdmin && <TableHead className="px-4 py-3 sm:py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400 hidden lg:table-cell">Platform</TableHead>}
                      <TableHead className="px-4 py-3 sm:pr-8 sm:py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentUsers.map((u, i) => (
                      <TableRow key={i} className={`hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors border-zinc-50 dark:border-zinc-800 group ${selectedUserIds.includes(u.uid) ? 'bg-zinc-50 dark:bg-zinc-800/50' : ''}`}>
                        <TableCell className="px-4"><Checkbox checked={selectedUserIds.includes(u.uid)} onCheckedChange={() => toggleUserSelection(u.uid)} /></TableCell>
                        <TableCell className="px-4 py-3 sm:px-8 sm:py-5">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-700 dark:to-zinc-600 flex items-center justify-center text-sm font-black text-zinc-600 dark:text-zinc-300 flex-shrink-0">
                              {u.displayName?.charAt(0) ?? '?'}
                            </div>
                            <span className="font-bold text-zinc-900 dark:text-white">{u.displayName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3 sm:px-0 sm:py-5 text-xs font-medium text-zinc-500 hidden sm:table-cell">{u.email}</TableCell>
                        <TableCell className="px-4 py-3 sm:px-0 sm:py-5">
                          <Badge className={`rounded-lg px-3 py-1 border-none font-black text-[9px] uppercase tracking-widest ${u.isSuperAdmin ? 'bg-rose-500/10 text-rose-600' : u.role === 'admin' ? 'bg-amber-500/10 text-amber-600' : u.role === 'landlord' ? 'bg-blue-500/10 text-blue-600' : u.role === 'tenant' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-purple-500/10 text-purple-600'}`}>
                            {u.isSuperAdmin ? 'SuperAdmin' : u.role}
                          </Badge>
                        </TableCell>
                        {profile.isSuperAdmin && (
                          <TableCell className="px-4 py-3 sm:px-0 sm:py-5 text-[10px] font-black text-zinc-400 tracking-tighter hidden lg:table-cell">
                            {platforms.find(p => p.id === u.platformId)?.name || 'ROOT'}
                          </TableCell>
                        )}
                        <TableCell className="px-4 py-3 sm:pr-8 sm:py-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <DropdownMenu>
                              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="h-8 w-8 rounded-xl" />}>
                                <FontAwesomeIcon icon={faEllipsisVertical} />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 rounded-2xl">
                                <div className="px-2 py-1.5 text-xs font-black uppercase text-zinc-400">Actions</div>
                                <DropdownMenuSeparator />
                                {onImpersonate && !u.isSuperAdmin && u.uid !== profile.uid && (
                                  <DropdownMenuItem onClick={() => onImpersonate(u)} className="font-bold text-sm cursor-pointer">
                                    <FontAwesomeIcon icon={faEye} className="mr-2 h-3.5 w-3.5 text-zinc-400" /> View As
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => { setSelectedUserForRole(u); setUpdateRoleForm({ role: u.role }); setIsUpdateRoleOpen(true); }} className="font-bold text-sm cursor-pointer">
                                  <FontAwesomeIcon icon={faUserShield} className="mr-2 h-3.5 w-3.5 text-zinc-400" /> Update Role
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handlePauseAccount(u)} className="font-bold text-sm cursor-pointer text-amber-600 focus:text-amber-700 focus:bg-amber-50 dark:focus:bg-amber-900/20">
                                  <FontAwesomeIcon icon={u.status === 'suspended' ? faCheckCircle : faTimesCircle} className="mr-2 h-3.5 w-3.5" /> {u.status === 'suspended' ? 'Unpause Account' : 'Pause Account'}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDeleteAccount(u)} className="font-bold text-sm cursor-pointer text-rose-600 focus:text-rose-700 focus:bg-rose-50 dark:focus:bg-rose-900/20">
                                  <FontAwesomeIcon icon={faTrash} className="mr-2 h-3.5 w-3.5" /> Delete Account
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {users.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={profile.isSuperAdmin ? 5 : 4} className="h-40 text-center text-zinc-400 font-bold uppercase tracking-widest text-xs">
                          No users found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              
              {/* Pagination Controls */}
              {totalUserPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-zinc-50 dark:border-zinc-800">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest pl-4">
                    Showing {indexOfFirstUser + 1} to {Math.min(indexOfLastUser, users.length)} of {users.length}
                  </span>
                  <div className="flex items-center gap-2 pr-4">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-xl h-8 w-8 p-0"
                      disabled={userPage === 1}
                      onClick={() => setUserPage(p => Math.max(1, p - 1))}
                    >
                      <FontAwesomeIcon icon={faChevronLeft} className="h-3 w-3" />
                    </Button>
                    <span className="text-xs font-black text-zinc-600 min-w-[20px] text-center">{userPage}</span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-xl h-8 w-8 p-0"
                      disabled={userPage === totalUserPages}
                      onClick={() => setUserPage(p => Math.min(totalUserPages, p + 1))}
                    >
                      <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── PENDING TAB ── */}
        {activeTab === 'pending' && (
          <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:bg-zinc-900 rounded-3xl overflow-hidden">
            <CardHeader className="p-4 sm:p-8 border-b border-zinc-50 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-xl font-black">Awaiting Authentication</CardTitle>
                <CardDescription className="font-medium text-zinc-500">Invitations dispatched but not yet claimed.</CardDescription>
              </div>
              <div className="relative w-full sm:max-w-xs shrink-0">
                <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-400" />
                <Input 
                  placeholder="Search invitations..." 
                  className="h-9 pl-8 text-xs font-bold rounded-xl border-zinc-200" 
                  value={inviteSearch} 
                  onChange={(e) => { setInviteSearch(e.target.value); setInvitePage(1); }} 
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-50/50 dark:bg-zinc-800/50 hover:bg-transparent border-none">
                    <TableHead className="px-8 py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Name</TableHead>
                    <TableHead className="py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Target Email</TableHead>
                    <TableHead className="py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Assigned Role</TableHead>
                    {profile.isSuperAdmin && <TableHead className="py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Platform</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedInvs.map((inv, i) => (
                    <TableRow key={i} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors border-zinc-50 dark:border-zinc-800">
                      <TableCell className="px-8 py-5 font-bold">{inv.displayName}</TableCell>
                      <TableCell className="text-xs font-medium">{inv.email}</TableCell>
                      <TableCell><Badge variant="secondary" className="rounded-lg px-2 py-0.5 font-bold uppercase text-[9px]">{inv.role}</Badge></TableCell>
                      {profile.isSuperAdmin && (
                        <TableCell className="text-[10px] font-black text-zinc-400">
                          {platforms.find(p => p.id === inv.platformId)?.name || 'EXTERNAL'}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {paginatedInvs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={profile.isSuperAdmin ? 4 : 3} className="h-40 text-center text-zinc-400 font-bold uppercase tracking-widest text-xs">
                        No pending authorizations found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {totalInvitePages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-zinc-50 dark:border-zinc-800">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest pl-4">
                    Page {invitePage} of {totalInvitePages}
                  </span>
                  <div className="flex items-center gap-2 pr-4">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-xl h-8 w-8 p-0"
                      disabled={invitePage === 1}
                      onClick={() => setInvitePage(p => Math.max(1, p - 1))}
                    >
                      <FontAwesomeIcon icon={faChevronLeft} className="h-3 w-3" />
                    </Button>
                    <span className="text-xs font-black text-zinc-600 min-w-[20px] text-center">{invitePage}</span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-xl h-8 w-8 p-0"
                      disabled={invitePage === totalInvitePages}
                      onClick={() => setInvitePage(p => Math.min(totalInvitePages, p + 1))}
                    >
                      <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── ASSETS TAB ── */}
        {activeTab === 'properties' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:bg-zinc-900 rounded-3xl overflow-hidden">
            <CardHeader className="p-4 sm:p-8 border-b border-zinc-50 dark:border-zinc-800">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-xl font-black">Global Asset Index</CardTitle>
                  <CardDescription className="font-medium text-zinc-500">Real-time status of all managed property nodes.</CardDescription>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-wrap">
                  <div className="relative w-full sm:max-w-xs shrink-0">
                    <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-400" />
                    <Input 
                      placeholder="Search properties..." 
                      className="h-9 pl-8 text-xs font-bold rounded-xl border-zinc-200" 
                      value={adminPropertySearch} 
                      onChange={(e) => { setAdminPropertySearch(e.target.value); setAdminPropertyPage(1); }} 
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Dialog open={isBulkAddOpen} onOpenChange={setIsBulkAddOpen}>
                      <DialogTrigger render={<Button className="rounded-xl font-bold bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100" />}>
                        <FontAwesomeIcon icon={faTools} className="mr-2 h-3 w-3" />
                        Bulk Add
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[700px] p-0 rounded-3xl border-none bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
                          <DialogTitle className="text-xl font-black">Bulk Add Units</DialogTitle>
                          <DialogDescription className="font-medium text-zinc-500">Rapidly generate multiple units for a building.</DialogDescription>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-6 flex-1">
                          <div className="grid sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Landlord *</label>
                              <Select value={bulkAddForm.landlordId} onValueChange={(val) => setBulkAddForm({ ...bulkAddForm, landlordId: val })}>
                                <SelectTrigger className="h-12 rounded-xl">
                                  <SelectValue placeholder="Select landlord" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={profile.uid}>Self ({profile.displayName})</SelectItem>
                                  {users.filter(u => u.role === 'landlord').map(u => (
                                    <SelectItem key={u.uid} value={u.uid}>{u.displayName} ({u.email})</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Building</label>
                              <Select value={bulkAddForm.buildingId} onValueChange={(val) => setBulkAddForm({ ...bulkAddForm, buildingId: val })}>
                                <SelectTrigger className="h-12 rounded-xl">
                                  <SelectValue placeholder="Select building" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No Building (Standalone)</SelectItem>
                                  {buildings.map(b => (
                                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Unit Type</label>
                              <Select value={bulkAddForm.type} onValueChange={(val: any) => setBulkAddForm({ ...bulkAddForm, type: val })}>
                                <SelectTrigger className="h-12 rounded-xl">
                                  <SelectValue placeholder="Type" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="residential">Residential</SelectItem>
                                  <SelectItem value="commercial">Commercial</SelectItem>
                                  <SelectItem value="bnb">BNB / Daily</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Base Price (Ksh)</label>
                              <Input type="number" className="h-12 rounded-xl" value={bulkAddForm.price} onChange={e => setBulkAddForm({...bulkAddForm, price: e.target.value})} placeholder="e.g. 50000" />
                            </div>
                          </div>
                          
                          <div className="grid sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950">
                            <div className="space-y-2">
                              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Prefix</label>
                              <Input className="h-12 rounded-xl" value={bulkAddForm.prefix} onChange={e => setBulkAddForm({...bulkAddForm, prefix: e.target.value})} placeholder="A-" />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Start #</label>
                              <Input type="number" className="h-12 rounded-xl" value={bulkAddForm.startNumber} onChange={e => setBulkAddForm({...bulkAddForm, startNumber: parseInt(e.target.value) || 1})} placeholder="101" />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Count</label>
                              <Input type="number" className="h-12 rounded-xl" value={bulkAddForm.count} onChange={e => setBulkAddForm({...bulkAddForm, count: parseInt(e.target.value) || 10})} placeholder="10" />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Shared Amenities (comma separated)</label>
                            <Input className="h-12 rounded-xl" value={bulkAddForm.amenities} onChange={e => setBulkAddForm({...bulkAddForm, amenities: e.target.value})} placeholder="e.g. WiFi, Desk, AC" />
                          </div>
                        </div>
                        <div className="p-6 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 flex justify-end gap-3">
                          <Button variant="ghost" onClick={() => setIsBulkAddOpen(false)}>Cancel</Button>
                          <Button onClick={handleBulkAddProperties} className="bg-zinc-950 text-white hover:bg-zinc-800">Generate {bulkAddForm.count} Units</Button>
                        </div>
                      </DialogContent>
                    </Dialog>

                    <Dialog open={isAddBuildingOpen} onOpenChange={setIsAddBuildingOpen}>
                      <DialogTrigger render={<Button className="rounded-xl font-bold bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100" />}>
                        <FontAwesomeIcon icon={faPlus} className="mr-2 h-3 w-3" />
                        Building
                      </DialogTrigger>
                      <DialogContent className="rounded-3xl border-none shadow-2xl bg-white dark:bg-zinc-900">
                        <DialogHeader>
                          <DialogTitle className="text-xl font-black">Add New Building</DialogTitle>
                          <DialogDescription className="font-medium text-zinc-500">Create a new building entity.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid gap-2">
                            <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Building Name</label>
                            <Input className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800" value={buildingForm.name} onChange={e => setBuildingForm({...buildingForm, name: e.target.value})} placeholder="Sunset Apartments" />
                          </div>
                          <div className="grid gap-2">
                            <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Address</label>
                            <Input className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800" value={buildingForm.address} onChange={e => setBuildingForm({...buildingForm, address: e.target.value})} placeholder="123 Main St" />
                          </div>
<div className="grid gap-2">
                            <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Assign Landlord</label>
                            <select className="h-12 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 text-sm font-semibold focus:ring-2 focus:ring-zinc-400 outline-none" value={buildingForm.landlordId} onChange={e => setBuildingForm({...buildingForm, landlordId: e.target.value})}>
                              <option value="">Select a Landlord...</option>
                              <option value={profile.uid}>Self ({profile.displayName})</option>
                              {users.filter(u => u.role === 'landlord').map(u => (
                                <option key={u.uid} value={u.uid}>{u.displayName} ({u.email})</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <DialogFooter>
                            <Button variant="ghost" className="font-bold rounded-xl h-12" onClick={() => setIsAddBuildingOpen(false)}>Cancel</Button>
                            <Button className="font-black rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-900 h-12 px-6" onClick={handleAddBuilding}>Add Building</Button>
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

                      <Dialog open={isAddPropertyOpen} onOpenChange={setIsAddPropertyOpen}>
                      <DialogTrigger render={<Button className="rounded-xl font-bold bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-955" />}>
                        <FontAwesomeIcon icon={faPlus} className="mr-2 h-3 w-3" />
                        Property
                      </DialogTrigger>
                      <DialogContent className="rounded-3xl border-none shadow-2xl bg-white dark:bg-zinc-900 max-w-[500px]">
                        <DialogHeader>
                          <DialogTitle className="text-xl font-black">Add New Property</DialogTitle>
                          <DialogDescription className="font-medium text-zinc-500">Create a new property unit.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
                          <div className="grid gap-2">
                            <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Title</label>
                            <Input className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800" value={propertyForm.title} onChange={e => setPropertyForm({...propertyForm, title: e.target.value})} placeholder="Cozy 2BHK" />
                          </div>
                          <div className="grid gap-2">
                            <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Description</label>
                            <Input className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800" value={propertyForm.description} onChange={e => setPropertyForm({...propertyForm, description: e.target.value})} placeholder="Spacious and sunny..." />
                          </div>
                          <div className="grid gap-2">
                            <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Location</label>
                            <Input className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800" value={propertyForm.location} onChange={e => setPropertyForm({...propertyForm, location: e.target.value})} placeholder="Nairobi" />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Type</label>
                              <select className="h-12 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 text-sm font-semibold focus:ring-2 focus:ring-zinc-400 outline-none" value={propertyForm.type} onChange={e => setPropertyForm({...propertyForm, type: e.target.value})}>
                                <option value="residential">Residential</option>
                                <option value="commercial">Commercial</option>
                                <option value="bnb">Airbnb</option>
                              </select>
                            </div>
                            <div className="grid gap-2">
                              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Price (KES)</label>
                              <Input className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800" type="number" value={propertyForm.price} onChange={e => setPropertyForm({...propertyForm, price: e.target.value})} placeholder="25000" />
                            </div>
                          </div>
                          <div className="grid gap-2">
                            <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Assign Landlord</label>
                            <select className="h-12 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 text-sm font-semibold focus:ring-2 focus:ring-zinc-400 outline-none" value={propertyForm.landlordId} onChange={e => setPropertyForm({...propertyForm, landlordId: e.target.value})}>
                              <option value="">Select a Landlord...</option>
                              <option value={profile.uid}>Self ({profile.displayName})</option>
                              {users.filter(u => u.role === 'landlord').map(u => (
                                <option key={u.uid} value={u.uid}>{u.displayName} ({u.email})</option>
                              ))}
                            </select>
                          </div>
                          <div className="grid gap-2">
                            <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Images</label>
                            <Input type="file" multiple accept="image/*" onChange={handleImageUpload} disabled={isUploading} className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                            {isUploading && <p className="text-xs text-blue-500 font-bold mt-1 animate-pulse">Uploading images...</p>}
                            {propertyForm.images && <p className="text-[10px] text-zinc-500 font-bold">{propertyForm.images.split(',').filter(x => x).length} images attached</p>}
                          </div>
                        </div>
                        <DialogFooter className="mt-2">
                          <Button variant="ghost" className="font-bold rounded-xl h-12" onClick={() => setIsAddPropertyOpen(false)}>Cancel</Button>
                          <Button className="font-black rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-900 h-12 px-6" onClick={handleAddProperty}>Add Property</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-50/50 dark:bg-zinc-800/50 hover:bg-transparent border-none">
                    <TableHead className="px-8 py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Asset Title</TableHead>
                    <TableHead className="py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Coordinates</TableHead>
                    <TableHead className="py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Valuation</TableHead>
                    <TableHead className="py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Status</TableHead>
                    {profile.isSuperAdmin && <TableHead className="py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Instance</TableHead>}
                    <TableHead className="text-right px-8 py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedProps.map((p, i) => (
                    <TableRow key={i} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors border-zinc-50 dark:border-zinc-800">
                      <TableCell className="px-8 py-5 font-bold">{p.title}</TableCell>
                      <TableCell className="text-xs font-medium">{p.location}</TableCell>
                      <TableCell className="text-xs font-black text-zinc-700">KES {p.price?.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`rounded-lg px-2 py-0.5 font-black uppercase text-[9px] border-none ${p.status === 'available' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                          {p.status}
                        </Badge>
                      </TableCell>
                      {profile.isSuperAdmin && (
                        <TableCell className="text-[10px] font-black text-zinc-400 uppercase tracking-tighter">
                          {platforms.find(plat => plat.id === p.platformId)?.name || 'ROOT'}
                        </TableCell>
                      )}
                      <TableCell className="px-8 py-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Edit Property"
                            onClick={() => { setEditingProperty(p); setIsEditPropertyOpen(true); }}
                            className="h-8 w-8 rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                          >
                            <FontAwesomeIcon icon={faEdit} className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Assign Landlord"
                            onClick={() => { setSelectedPropertyToAssign(p.id); setAssignLandlordId(p.landlordId || ''); setIsAssignLandlordOpen(true); }}
                            className="h-8 w-8 rounded-xl text-blue-500 hover:text-blue-600 hover:bg-blue-50"
                          >
                            <FontAwesomeIcon icon={faUserShield} className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Delete Property"
                            onClick={() => handleDeleteProperty(p.id)}
                            className="h-8 w-8 rounded-xl text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                          >
                            <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {paginatedProps.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={profile.isSuperAdmin ? 6 : 5} className="h-40 text-center text-zinc-400 font-bold uppercase tracking-widest text-xs">
                        No properties found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              
              {totalAdminPropertyPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-zinc-50 dark:border-zinc-800">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest pl-4">
                    Page {adminPropertyPage} of {totalAdminPropertyPages}
                  </span>
                  <div className="flex items-center gap-2 pr-4">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-xl h-8 w-8 p-0"
                      disabled={adminPropertyPage === 1}
                      onClick={() => setAdminPropertyPage(p => Math.max(1, p - 1))}
                    >
                      <FontAwesomeIcon icon={faChevronLeft} className="h-3 w-3" />
                    </Button>
                    <span className="text-xs font-black text-zinc-600 min-w-[20px] text-center">{adminPropertyPage}</span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-xl h-8 w-8 p-0"
                      disabled={adminPropertyPage === totalAdminPropertyPages}
                      onClick={() => setAdminPropertyPage(p => Math.min(totalAdminPropertyPages, p + 1))}
                    >
                      <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:bg-zinc-900 rounded-3xl overflow-hidden mt-6">
            <CardHeader className="p-4 sm:p-8 border-b border-zinc-50 dark:border-zinc-800">
              <CardTitle className="text-xl font-black">Asset Groups (Buildings)</CardTitle>
              <CardDescription className="font-medium text-zinc-500">Manage empty or populated building groups.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-50/50 dark:bg-zinc-800/50 hover:bg-transparent border-none">
                    <TableHead className="px-8 py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Building Name</TableHead>
                    <TableHead className="py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Location</TableHead>
                    <TableHead className="py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Total Units</TableHead>
                    <TableHead className="text-right px-8 py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buildings.map((b, i) => {
                    const unitCount = properties.filter(p => p.buildingId === b.id).length;
                    return (
                      <TableRow key={i} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors border-zinc-50 dark:border-zinc-800">
                        <TableCell className="px-8 py-5 font-bold">{b.name}</TableCell>
                        <TableCell className="text-xs font-medium">{b.address}</TableCell>
                        <TableCell className="text-xs font-black text-zinc-700">{unitCount}</TableCell>
                        <TableCell className="px-8 py-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Edit Building"
                              onClick={() => { setEditBuildingForm({ id: b.id, name: b.name, address: b.address || '' }); setIsEditBuildingOpen(true); }}
                              className="h-8 w-8 rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                            >
                              <FontAwesomeIcon icon={faEdit} className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Delete Building"
                              onClick={() => handleDeleteBuilding(b.id)}
                              className="h-8 w-8 rounded-xl text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                            >
                              <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {buildings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="h-40 text-center text-zinc-400 font-bold uppercase tracking-widest text-xs">
                        No buildings found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          </div>
        )}

        {/* ── NETWORK TAB ── */}
        {activeTab === 'platforms' && profile.isSuperAdmin && (
          <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:bg-zinc-900 rounded-3xl overflow-hidden">
            <CardHeader className="p-4 sm:p-8 border-b border-zinc-50 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-xl font-black">Platform Lease Network</CardTitle>
                <CardDescription className="font-medium text-zinc-500">Monitoring and controlling all active software instances.</CardDescription>
              </div>
              <div className="relative w-full sm:max-w-xs shrink-0">
                <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-400" />
                <Input 
                  placeholder="Search platforms..." 
                  className="h-9 pl-8 text-xs font-bold rounded-xl border-zinc-200" 
                  value={platformSearch} 
                  onChange={(e) => { setPlatformSearch(e.target.value); setPlatformPage(1); }} 
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-50/50 dark:bg-zinc-800/50 hover:bg-transparent border-none">
                    <TableHead className="px-8 py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Platform</TableHead>
                    <TableHead className="py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Slug ID</TableHead>
                    <TableHead className="py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Node Owner</TableHead>
                    <TableHead className="py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Status</TableHead>
                    <TableHead className="text-right px-8 py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPlats.map((plat) => (
                    <TableRow key={plat.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors border-zinc-50 dark:border-zinc-800">
                      <TableCell className="px-8 py-5 font-black text-zinc-800 dark:text-white">{plat.name}</TableCell>
                      <TableCell className="text-xs font-black font-mono tracking-tighter bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded inline-block mt-4">{plat.slug}</TableCell>
                      <TableCell className="text-xs font-medium">{plat.ownerEmail}</TableCell>
                      <TableCell>
                        <Badge className={`rounded-xl px-4 py-1 font-black text-[9px] uppercase tracking-[0.1em] border-none ${plat.status === 'active' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-rose-600 hover:bg-rose-700 text-white'}`}>
                          {plat.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right px-8 py-5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-xl h-10 w-10 p-0"
                          onClick={() => togglePlatformStatus(plat.id, plat.status)}
                        >
                          {plat.status === 'active'
                            ? <FontAwesomeIcon icon={faTimesCircle} className="h-5 w-5 text-rose-500" />
                            : <FontAwesomeIcon icon={faCheckCircle} className="h-5 w-5 text-emerald-500" />
                          }
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {paginatedPlats.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-40 text-center text-zinc-400 font-bold uppercase tracking-widest text-xs">
                        No platform lease instances found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {totalPlatformPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-zinc-50 dark:border-zinc-800">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest pl-4">
                    Page {platformPage} of {totalPlatformPages}
                  </span>
                  <div className="flex items-center gap-2 pr-4">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-xl h-8 w-8 p-0"
                      disabled={platformPage === 1}
                      onClick={() => setPlatformPage(p => Math.max(1, p - 1))}
                    >
                      <FontAwesomeIcon icon={faChevronLeft} className="h-3 w-3" />
                    </Button>
                    <span className="text-xs font-black text-zinc-600 min-w-[20px] text-center">{platformPage}</span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-xl h-8 w-8 p-0"
                      disabled={platformPage === totalPlatformPages}
                      onClick={() => setPlatformPage(p => Math.min(totalPlatformPages, p + 1))}
                    >
                      <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── AUDIT LOG TAB ── */}
        {activeTab === 'audit' && profile.isSuperAdmin && (
          <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:bg-zinc-900 rounded-3xl overflow-hidden">
            <CardHeader className="p-4 sm:p-8 border-b border-zinc-50 dark:border-zinc-800">
              <div className="flex flex-col xl:flex-row xl:items-center gap-4 justify-between">
                <div>
                  <CardTitle className="text-xl font-black flex items-center gap-2">
                    <FontAwesomeIcon icon={faClipboardList} className="h-5 w-5 text-zinc-400" />
                    System Audit Log
                  </CardTitle>
                  <CardDescription className="font-medium text-zinc-500 mt-1">
                    Real-time action trail across all users. Showing last 200 events.
                  </CardDescription>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="relative w-full sm:max-w-xs shrink-0">
                    <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-400" />
                    <Input 
                      placeholder="Search audit trail..." 
                      className="h-9 pl-8 text-xs font-bold rounded-xl border-zinc-200" 
                      value={auditSearch} 
                      onChange={(e) => { setAuditSearch(e.target.value); setAuditLogPage(1); }} 
                    />
                  </div>
                  {/* User filter */}
                  <div className="relative">
                    <FontAwesomeIcon icon={faUser} className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-400" />
                    <select
                      className="h-10 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 pl-9 pr-8 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-zinc-400 transition-all appearance-none cursor-pointer min-w-[180px]"
                      value={auditUserId}
                      onChange={e => { setAuditUserId(e.target.value); setAuditLogPage(1); }}
                    >
                      <option value="all">All Users</option>
                      {users.map(u => (
                        <option key={u.uid} value={u.uid}>{u.displayName} ({u.email})</option>
                      ))}
                    </select>
                    <FontAwesomeIcon icon={faChevronDown} className="absolute right-3 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-zinc-400 pointer-events-none" />
                  </div>

                  <Button variant="outline" size="sm" className="gap-2 rounded-xl h-10 font-bold" onClick={exportAuditCSV}>
                    <FontAwesomeIcon icon={faDownload} className="h-3.5 w-3.5" />
                    Export CSV
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {auditLoading ? (
                <div className="flex items-center justify-center py-16 gap-3">
                  <FontAwesomeIcon icon={faSpinner} className="h-5 w-5 animate-spin text-zinc-400" />
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Loading audit trail...</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-zinc-50/50 dark:bg-zinc-800/50 hover:bg-transparent border-none">
                        <TableHead className="px-8 py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Timestamp</TableHead>
                        <TableHead className="py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">User</TableHead>
                        <TableHead className="py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Action</TableHead>
                        <TableHead className="py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400">Resource</TableHead>
                        <TableHead className="py-4 pr-8 font-black text-[10px] uppercase tracking-widest text-zinc-400">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedAudits.map((log) => (
                        <TableRow key={log.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors border-zinc-50 dark:border-zinc-800">
                          <TableCell className="px-8 py-4">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-black text-zinc-700 dark:text-zinc-300">
                                {new Date(log.createdAt).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                              <span className="text-[10px] font-medium text-zinc-400">
                                {new Date(log.createdAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-black text-zinc-500">
                                {log.userEmail.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 max-w-[160px] truncate">
                                {log.userEmail}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${ACTION_COLORS[log.action] ?? 'bg-zinc-100 text-zinc-600'}`}>
                              {log.action.replace(/_/g, ' ')}
                            </span>
                          </TableCell>
                          <TableCell>
                            {log.resource ? (
                              <span className="text-xs font-medium text-zinc-500 capitalize">{log.resource}</span>
                            ) : (
                              <span className="text-zinc-300 text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="pr-8">
                            {log.metadata && Object.keys(log.metadata).length > 0 ? (
                              <details className="cursor-pointer">
                                <summary className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest hover:text-zinc-600 transition-colors list-none flex items-center gap-1">
                                  <FontAwesomeIcon icon={faChevronDown} className="h-2.5 w-2.5" />
                                  View
                                </summary>
                                <pre className="mt-2 text-[10px] bg-zinc-50 dark:bg-zinc-800 rounded-lg p-2 font-mono text-zinc-600 dark:text-zinc-300 max-w-xs overflow-x-auto">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </details>
                            ) : (
                              <span className="text-zinc-300 text-xs">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {paginatedAudits.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="h-40 text-center">
                            <div className="flex flex-col items-center gap-2 text-zinc-400">
                              <FontAwesomeIcon icon={faClipboardList} className="h-8 w-8 opacity-30" />
                              <span className="font-bold uppercase tracking-widest text-xs">No audit events found.</span>
                              <span className="text-[10px]">Events appear here as users interact with the system.</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              {totalAuditLogPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-zinc-50 dark:border-zinc-800">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest pl-4">
                    Page {auditLogPage} of {totalAuditLogPages}
                  </span>
                  <div className="flex items-center gap-2 pr-4">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-xl h-8 w-8 p-0"
                      disabled={auditLogPage === 1}
                      onClick={() => setAuditLogPage(p => Math.max(1, p - 1))}
                    >
                      <FontAwesomeIcon icon={faChevronLeft} className="h-3 w-3" />
                    </Button>
                    <span className="text-xs font-black text-zinc-600 min-w-[20px] text-center">{auditLogPage}</span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-xl h-8 w-8 p-0"
                      disabled={auditLogPage === totalAuditLogPages}
                      onClick={() => setAuditLogPage(p => Math.min(totalAuditLogPages, p + 1))}
                    >
                      <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
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
                <img src={adminProfile.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.uid}`} alt="Profile" className="h-full w-full object-cover" />
                <label className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 hover:opacity-100 cursor-pointer transition-opacity">
                  <FontAwesomeIcon icon={faEdit} />
                  <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={isUploading} />
                </label>
              </div>
              {isUploading && <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 animate-pulse">Uploading...</p>}
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Display Name</label>
              <Input className="h-12 rounded-xl" value={adminProfile.displayName} onChange={e => setAdminProfile({...adminProfile, displayName: e.target.value})} />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Phone</label>
              <Input className="h-12 rounded-xl" value={adminProfile.phone} onChange={e => setAdminProfile({...adminProfile, phone: e.target.value})} />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Address</label>
              <Textarea className="rounded-xl" value={adminProfile.address} onChange={e => setAdminProfile({...adminProfile, address: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl font-bold" onClick={() => setIsProfileOpen(false)}>Cancel</Button>
            <Button className="h-10 px-8 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-black" onClick={handleUpdateProfile}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Assign Landlord Dialog */}
      <Dialog open={isAssignLandlordOpen} onOpenChange={setIsAssignLandlordOpen}>
        <DialogContent className="sm:max-w-[450px] p-6 rounded-3xl border-none bg-white dark:bg-zinc-900 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Assign Landlord</DialogTitle>
            <DialogDescription className="font-medium text-zinc-500">
              Transfer ownership of this property to another landlord.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Select Landlord</label>
              <select
                className="h-12 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 text-sm font-semibold focus:ring-2 focus:ring-zinc-400 outline-none"
                value={assignLandlordId}
                onChange={e => setAssignLandlordId(e.target.value)}
              >
                <option value="">Choose Landlord...</option>
                <option value={profile.uid}>Self ({profile.displayName})</option>
                {users.filter(u => u.role === 'landlord').map(u => (
                  <option key={u.uid} value={u.uid}>{u.displayName} ({u.email})</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl font-bold" onClick={() => setIsAssignLandlordOpen(false)}>Cancel</Button>
            <Button className="h-10 px-8 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-black" onClick={handleAssignPropertyLandlord}>Save Assignment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Property Dialog */}
      <Dialog open={isEditPropertyOpen} onOpenChange={setIsEditPropertyOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto p-6 rounded-3xl border-none bg-white dark:bg-zinc-900 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Edit Property</DialogTitle>
            <DialogDescription className="font-medium text-zinc-500">Update property details and configurations.</DialogDescription>
          </DialogHeader>
          {editingProperty && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Title</label>
                <Input
                  className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800"
                  value={editingProperty.title}
                  onChange={e => setEditingProperty({ ...editingProperty, title: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Description</label>
                <Input
                  className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800"
                  value={editingProperty.description}
                  onChange={e => setEditingProperty({ ...editingProperty, description: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Location</label>
                <Input
                  className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800"
                  value={editingProperty.location}
                  onChange={e => setEditingProperty({ ...editingProperty, location: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Type</label>
                  <select
                    className="h-12 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 text-sm font-semibold focus:ring-2 focus:ring-zinc-400 outline-none"
                    value={editingProperty.type}
                    onChange={e => setEditingProperty({ ...editingProperty, type: e.target.value })}
                  >
                    <option value="residential">Residential</option>
                    <option value="commercial">Commercial</option>
                    <option value="bnb">Airbnb</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Price (KES)</label>
                  <Input
                    type="number"
                    className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800"
                    value={editingProperty.price}
                    onChange={e => setEditingProperty({ ...editingProperty, price: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Landlord</label>
                <select
                  className="h-12 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 text-sm font-semibold focus:ring-2 focus:ring-zinc-400 outline-none"
                  value={editingProperty.landlordId}
                  onChange={e => setEditingProperty({ ...editingProperty, landlordId: e.target.value })}
                >
                  <option value="">Choose Landlord...</option>
                  <option value={profile.uid}>Self ({profile.displayName})</option>
                  {users.filter(u => u.role === 'landlord').map(u => (
                    <option key={u.uid} value={u.uid}>{u.displayName} ({u.email})</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Images</label>
                <Input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleEditImageUpload}
                  disabled={isUploading}
                  className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {isUploading && <p className="text-xs text-blue-500 font-bold mt-1 animate-pulse">Uploading images...</p>}
                {editingProperty?.images && (
                  <p className="text-[10px] text-zinc-500 font-bold">
                    {Array.isArray(editingProperty?.images)
                      ? editingProperty.images.length
                      : (editingProperty.images || '').split(',').filter((x: any) => x).length
                    } images attached
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl font-bold" onClick={() => setIsEditPropertyOpen(false)}>Cancel</Button>
            <Button className="h-10 px-8 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-black" onClick={handleUpdateProperty}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
