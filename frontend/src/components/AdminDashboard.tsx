import { useState, useEffect, useRef } from 'react';
import { Pagination, usePagination } from '@/components/ui/pagination';
import { getSubscriptionFeatures } from '../../../shared/landlordSubscription';
import {
  provisionUser,
  resendInvitation,
  updateUserStatus,
  deleteUserAccount,
  updateUserRole,
  createBuilding,
  updateBuilding,
  adminDeleteBuildingCascade,
  createProperties,
  updateProperty,
  deleteProperty,
  createPlatform,
  togglePlatformStatus as togglePlatformStatusRequest,
  updateMyProfile,
  uploadFile,
} from '../lib/api';
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
import { Input } from '@/components/ui/input';
import MapPicker from './MapPicker';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminDashboard, useAuditLogs } from '../lib/queries';
import AdminOverview from './admin/AdminOverview';

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

const TAB_TITLES: Record<string, { title: string; description: string }> = {
  dashboard: { title: 'Overview', description: 'How things are going across your properties and users.' },
  registered: { title: 'Users', description: 'Everyone with an account. Search, change roles or suspend access.' },
  pending: { title: 'Pending invites', description: "People you've invited who haven't set up their account yet." },
  properties: { title: 'Properties', description: 'Every unit and building, with its landlord and status.' },
  platforms: { title: 'Platforms', description: 'Separate workspaces for agencies and their landlords.' },
  audit: { title: 'Activity log', description: 'A record of important actions, newest first.' },
};

export default function AdminDashboard({ profile, onImpersonate, activeTab, setActiveTab }: AdminDashboardProps) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [buildings, setBuildings] = useState<any[]>([]);
  const buildingPager = usePagination(buildings, 10);
  const busyRef = useRef(false);
  const guard = <A extends unknown[]>(key: string, fn: (...args: A) => Promise<unknown>) => async (...args: A) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyAction(key);
    try {
      await fn(...args);
    } finally {
      busyRef.current = false;
      setBusyAction(null);
    }
  };
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [rentPayments, setRentPayments] = useState<any[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);

  // Platform selection for SuperAdmins
  const [selectedPlatformId, setSelectedPlatformId] = useState<string>('all');
  const [isAddPlatformOpen, setIsAddPlatformOpen] = useState(false);
  const [newPlatform, setNewPlatform] = useState({ name: '', slug: '', ownerEmail: '', ownerPassword: '' });
  const [provisionedPlatform, setProvisionedPlatform] = useState<Platform | null>(null);
  const [showPlatformPassword, setShowPlatformPassword] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
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
  const [inviteForm, setInviteForm] = useState<{ 
    email: string; 
    displayName: string; 
    password?: string; 
    role: UserRole;
    rentRouting?: 'admin' | 'direct';
    rentPayoutMethod?: 'cash' | 'mpesa' | 'bank';
    mpesaSettlementPhone?: string;
  }>({ 
    email: '', 
    displayName: '', 
    password: '', 
    role: profile.role === 'landlord' ? 'tenant' : 'landlord',
    rentRouting: 'admin',
    rentPayoutMethod: 'mpesa',
    mpesaSettlementPhone: ''
  });
  const [isAddPropertyOpen, setIsAddPropertyOpen] = useState(false);
  const [propertyForm, setPropertyForm] = useState({ title: '', description: '', type: 'residential', price: '', location: '', landlordId: '', images: '' });
  const [isAddBuildingOpen, setIsAddBuildingOpen] = useState(false);
  const [isEditBuildingOpen, setIsEditBuildingOpen] = useState(false);
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);
  const [buildingForm, setBuildingForm] = useState({ name: '', address: '', landlordId: '', latitude: null as number | null, longitude: null as number | null });
  const [editBuildingForm, setEditBuildingForm] = useState({ id: '', name: '', address: '', latitude: null as number | null, longitude: null as number | null });
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

  const auditLogsQuery = useAuditLogs({ uid: profile.uid, userId: auditUserId }, Boolean(profile.isSuperAdmin));
  const auditLoading = auditLogsQuery.isFetching;
  useEffect(() => {
    if (auditLogsQuery.data) setAuditLogs(auditLogsQuery.data as AuditLog[]);
  }, [auditLogsQuery.data]);
  useEffect(() => {
    if (auditLogsQuery.error) console.error('Failed to load audit logs:', auditLogsQuery.error);
  }, [auditLogsQuery.error]);

  // Polls the consolidated admin dashboard endpoint (TanStack Query, keyed by viewer uid
  // and platform scope) — replaces the old five-table Supabase Realtime channel.
  // Filtering (platform scope, admin-vs-superadmin reach) is applied server-side; see
  // /admin/dashboard in app.ts. Query data is copied into local state because handlers
  // below update it optimistically.
  const dashboardPlatformId = profile.isSuperAdmin ? (selectedPlatformId === 'all' ? undefined : selectedPlatformId) : undefined;
  const {
    data: dashboardData,
    error: dashboardError,
    errorUpdatedAt: dashboardErrorAt,
  } = useAdminDashboard({ uid: profile.uid, viewerPlatformId: profile.platformId, platformId: dashboardPlatformId });

  // A scope change shows the loading state until that scope's data arrives (as before).
  useEffect(() => {
    if (!dashboardData && !dashboardError) setLoading(true);
  }, [profile.uid, profile.platformId, dashboardPlatformId]);

  useEffect(() => {
    if (!dashboardData) return;
    setUsers(dashboardData.users as UserProfile[]);
    setUserPage(1);
    setProperties(dashboardData.properties);
    setInvitations(dashboardData.invitations);
    setRentPayments(dashboardData.payments);
    setBuildings(dashboardData.buildings);
    if (profile.isSuperAdmin) setPlatforms(dashboardData.platforms as Platform[]);
    setLoading(false);
  }, [dashboardData]);

  useEffect(() => {
    if (!dashboardError) return;
    console.error('Admin dashboard fetch failed:', dashboardError);
    toast.error('Could not load dashboard data');
    setLoading(false);
  }, [dashboardError, dashboardErrorAt]);

  const handleUpdateRoleImpl = async () => {
    if (!selectedUserForRole) return;
    try {
      const updated = await updateUserRole(selectedUserForRole.uid, updateRoleForm.role as any);
      setUsers(prev => prev.map(u => u.uid === updated.uid ? (updated as UserProfile) : u));
      toast.success('Role updated successfully');
      setIsUpdateRoleOpen(false);
      setSelectedUserForRole(null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handlePauseAccountImpl = async (u: any) => {
    const newStatus = u.status === 'suspended' ? 'active' : 'suspended';
    try {
      await updateUserStatus(u.uid, newStatus);
      toast.success(`Account ${newStatus === 'suspended' ? 'paused' : 'unpaused'} successfully`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteAccountImpl = async (u: any) => {
    if (!window.confirm(`Are you sure you want to permanently delete ${u.displayName}?`)) return;
    try {
      await deleteUserAccount(u.uid);
      toast.success('Account deleted successfully');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleBulkDeleteUsersImpl = async () => {
    if (!window.confirm(`Are you sure you want to permanently delete ${selectedUserIds.length} users?`)) return;
    try {
      await Promise.all(selectedUserIds.map(uid => deleteUserAccount(uid)));
      toast.success(`${selectedUserIds.length} accounts deleted successfully`);
      setSelectedUserIds([]);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleBulkPauseUsersImpl = async () => {
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


  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const handleResendInvite = async (email: string) => {
    setResendingEmail(email);
    try {
      await resendInvitation(email);
      toast.success(`New invite sent to ${email}. The link expires in 7 days.`);
    } catch (error: any) {
      toast.error(error.message || 'Could not resend the invite.');
    } finally {
      setResendingEmail(null);
    }
  };

  const handleInviteUserImpl = async () => {
    if (!inviteForm.email || !inviteForm.displayName) {
      toast.error("Please fill in all required fields.");
      return;
    }
    try {
      const targetPlatformId = profile.isSuperAdmin ? (selectedPlatformId === 'all' ? null : selectedPlatformId) : profile.platformId;
      
      const result = await provisionUser({
        email: inviteForm.email.toLowerCase(),
        displayName: inviteForm.displayName,
        role: inviteForm.role,
        platformId: targetPlatformId,
        landlordId: profile.uid,
        mustChangePassword: true,
        rentRouting: inviteForm.role === 'landlord' ? inviteForm.rentRouting : undefined,
        rentPayoutMethod: inviteForm.role === 'landlord' && inviteForm.rentRouting === 'direct' ? inviteForm.rentPayoutMethod : undefined,
        mpesaSettlementPhone: inviteForm.role === 'landlord' && inviteForm.rentRouting === 'direct' ? inviteForm.mpesaSettlementPhone : undefined,
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

      toast.success(`Invitation sent to ${result.email}`);
      setIsInviteUserOpen(false);
      setInviteForm({ email: '', displayName: '', password: '', role: 'landlord', rentRouting: 'admin', rentPayoutMethod: 'mpesa', mpesaSettlementPhone: '' });
    } catch (err: any) {
      toast.error(err.message || "Failed to create user");
    }
  };

  const handleAddBuildingImpl = async () => {
    if (!buildingForm.name || !buildingForm.landlordId) {
      toast.error("Please fill in all required fields.");
      return;
    }
    try {
      const targetPlatformId = profile.isSuperAdmin ? (selectedPlatformId === 'all' ? null : selectedPlatformId) : profile.platformId;
      const created = await createBuilding({
        name: buildingForm.name,
        address: buildingForm.address,
        latitude: buildingForm.latitude,
        longitude: buildingForm.longitude,
        landlordId: buildingForm.landlordId,
        platformId: targetPlatformId,
      });
      setBuildings(prev => [...prev, created]);
      toast.success("Building added successfully!");
      setIsAddBuildingOpen(false);
      setBuildingForm({ name: '', address: '', landlordId: '', latitude: null, longitude: null });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleUpdateBuildingImpl = async () => {
    if (!editBuildingForm.name) return;
    try {
      const updated = await updateBuilding(editBuildingForm.id, {
        name: editBuildingForm.name,
        address: editBuildingForm.address,
        latitude: editBuildingForm.latitude,
        longitude: editBuildingForm.longitude,
      });
      setBuildings(prev => prev.map(b => b.id === editBuildingForm.id ? updated : b));
      toast.success('Building updated');
      setIsEditBuildingOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to update asset group");
    }
  };

  // Server-side cascade: also deletes every property in the building and the accounts
  // of any tenants assigned to them — see /admin/buildings/:id in app.ts.
  const handleDeleteBuildingImpl = async (id: string) => {
    if (!confirm("Are you sure you want to delete this asset group? ALL units inside and their associated tenant accounts will be PERMANENTLY deleted.")) return;
    try {
      await adminDeleteBuildingCascade(id);
      setBuildings(prev => prev.filter(b => b.id !== id));
      setProperties(prev => prev.filter(p => p.buildingId !== id));
      toast.success('Building, its units and tenant accounts deleted');
    } catch (err: any) {
      toast.error(err.message || "Failed to delete asset group");
    }
  };

  const handleAddPropertyImpl = async () => {
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
      const created = await createProperties(
        [{
          title: propertyForm.title,
          description: propertyForm.description,
          type: propertyForm.type,
          price: Number(propertyForm.price),
          location: propertyForm.location,
          images: imagesArr,
        }],
        propertyForm.landlordId,
        targetPlatformId,
      );
      setProperties(prev => [...prev, ...created]);
      toast.success("Property added successfully!");
      setIsAddPropertyOpen(false);
      setPropertyForm({ title: '', description: '', type: 'residential', price: '', location: '', landlordId: '', images: '' });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleBulkAddPropertiesImpl = async () => {
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
      const created = await createProperties(inserts, bulkAddForm.landlordId, targetPlatformId);
      setProperties(prev => [...prev, ...created]);

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
        const { url } = await uploadFile(file, `${Date.now()}-${i}.${file.name.split('.').pop()}`);
        uploadedUrls.push(url);
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
        const { url } = await uploadFile(file, `${Date.now()}-${i}.${file.name.split('.').pop()}`);
        uploadedUrls.push(url);
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

  const handleDeletePropertyImpl = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this property?")) return;
    try {
      await deleteProperty(id);
      toast.success("Property deleted successfully!");
      setProperties(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAssignPropertyLandlordImpl = async () => {
    if (!selectedPropertyToAssign || !assignLandlordId) return;
    try {
      await updateProperty(selectedPropertyToAssign, { landlordId: assignLandlordId });
      toast.success("Landlord assigned successfully!");
      setProperties(prev => prev.map(p => p.id === selectedPropertyToAssign ? { ...p, landlordId: assignLandlordId } : p));
      setIsAssignLandlordOpen(false);
      setSelectedPropertyToAssign(null);
      setAssignLandlordId('');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleUpdatePropertyImpl = async () => {
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
      await updateProperty(id, payload);
      toast.success("Property updated successfully!");
      setProperties(prev => prev.map(p => p.id === id ? { ...p, ...payload } : p));
      setIsEditPropertyOpen(false);
      setEditingProperty(null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAddPlatform = async () => {
    if (!newPlatform.name || !newPlatform.slug || !newPlatform.ownerEmail) {
      toast.error("Please fill in all required fields.");
      return;
    }
    try {
      // Server creates the platform + the admin invitation linked to it in one step.
      const createdPlat = await createPlatform({
        name: newPlatform.name,
        slug: newPlatform.slug,
        ownerEmail: newPlatform.ownerEmail.toLowerCase(),
      }) as Platform;

      try {
        await provisionUser({
          email: newPlatform.ownerEmail.toLowerCase(),
          displayName: `${newPlatform.name} Owner`,
          role: 'admin',
          platformId: createdPlat.id,
          mustChangePassword: true,
        });
      } catch (signUpError: any) {
        console.error('Master Admin auth registration error:', signUpError);
        toast.error(`Auth creation failed: ${signUpError.message}`);
      }

      toast.success(`Platform created. Invitation sent to ${newPlatform.ownerEmail.toLowerCase()}`);

      // Update local state synchronously to react instantly
      setPlatforms(prev => [...prev, createdPlat]);
      setProvisionedPlatform(createdPlat);
      setIsAddPlatformOpen(false);
      setNewPlatform({ name: '', slug: '', ownerEmail: '', ownerPassword: '' });
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleUpdateProfileImpl = async () => {
    try {
      await updateMyProfile(adminProfile);
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
      setAdminProfile({ ...adminProfile, avatarUrl: url });
    } catch (error) {
      toast.error("Failed to upload profile picture");
    } finally {
      setIsUploading(false);
    }
  };

  const togglePlatformStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      await togglePlatformStatusRequest(id, newStatus);
      setPlatforms(prev => prev.map(p => p.id === id ? { ...p, status: newStatus as Platform['status'] } : p));
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

  // One request at a time from this screen's buttons: repeat clicks are ignored while busy.
  const handleUpdateRole = guard('handleUpdateRole', handleUpdateRoleImpl);
  const handlePauseAccount = guard('handlePauseAccount', handlePauseAccountImpl);
  const handleDeleteAccount = guard('handleDeleteAccount', handleDeleteAccountImpl);
  const handleBulkDeleteUsers = guard('handleBulkDeleteUsers', handleBulkDeleteUsersImpl);
  const handleBulkPauseUsers = guard('handleBulkPauseUsers', handleBulkPauseUsersImpl);
  const handleInviteUser = guard('handleInviteUser', handleInviteUserImpl);
  const handleAddBuilding = guard('handleAddBuilding', handleAddBuildingImpl);
  const handleUpdateBuilding = guard('handleUpdateBuilding', handleUpdateBuildingImpl);
  const handleDeleteBuilding = guard('handleDeleteBuilding', handleDeleteBuildingImpl);
  const handleAddProperty = guard('handleAddProperty', handleAddPropertyImpl);
  const handleBulkAddProperties = guard('handleBulkAddProperties', handleBulkAddPropertiesImpl);
  const handleDeleteProperty = guard('handleDeleteProperty', handleDeletePropertyImpl);
  const handleAssignPropertyLandlord = guard('handleAssignPropertyLandlord', handleAssignPropertyLandlordImpl);
  const handleUpdateProperty = guard('handleUpdateProperty', handleUpdatePropertyImpl);
  const handleUpdateProfile = guard('handleUpdateProfile', handleUpdateProfileImpl);

  if (loading && platforms.length === 0 && users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="relative">
          <div className="absolute inset-0 rounded-2xl bg-zinc-100/80 blur-lg animate-pulse scale-150" />
          <img src="/bomalog.webp" alt="myboma" className="relative h-12 w-12 object-contain rounded-xl animate-logo-reveal" width="48" height="48" />
        </div>
        <p className="text-sm text-zinc-500">Loading…</p>
      </div>
    );
  }


  // Pagination calculations - User Registry
  const filteredUsers = users.filter(u => {
    const search = userSearch.toLowerCase();
    const platName = platforms.find(p => p.id === u.platformId)?.name || 'No platform';
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
    const platName = platforms.find(p => p.id === inv.platformId)?.name || 'No platform';
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
    const platName = platforms.find(plat => plat.id === p.platformId)?.name || 'No platform';
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
    <div className="db w-full min-w-0 pb-12 animate-in fade-in duration-300">
      {/* ── Page header ─────────────────────────── */}
      <div className="border-b border-teal-900/10 bg-white/35 px-4 py-4 backdrop-blur-md dark:border-white/10 dark:bg-teal-950/30 sm:px-6 sm:py-5 md:px-8">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center sm:gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
              {TAB_TITLES[activeTab || 'dashboard']?.title ?? 'Overview'}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              {TAB_TITLES[activeTab || 'dashboard']?.description ?? ''}
            </p>
          </div>

          <div className="hidden flex-wrap items-center gap-2.5 sm:flex">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl text-xs font-semibold"
              onClick={() => setIsProfileOpen(true)}
            >
              <FontAwesomeIcon icon={faUser} className="mr-1.5 h-3 w-3 text-slate-400" />
              My profile
            </Button>

            {profile.isSuperAdmin && (
              <>
                <div className="relative">
                  <select
                    className="h-9 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 pl-3 pr-8 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-slate-900/10 cursor-pointer shadow-2xs appearance-none"
                    value={selectedPlatformId}
                    onChange={(e) => setSelectedPlatformId(e.target.value)}
                  >
                    <option value="all">All platforms</option>
                    {platforms.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <FontAwesomeIcon icon={faChevronDown} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-[10px]" />
                </div>

                {/* Provision New Platform Modal (Section 11) */}
                <Dialog open={isAddPlatformOpen} onOpenChange={setIsAddPlatformOpen}>
                  <DialogTrigger render={
                    <Button size="sm" className="rounded-xl font-bold text-xs shadow-xs gap-1.5">
                      <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                      Add platform
                    </Button>
                  } />
                  <DialogContent className="sm:max-w-xl p-0 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
                    <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="h-7 w-7 rounded-lg bg-slate-900 dark:bg-slate-50 text-white dark:text-slate-900 flex items-center justify-center text-xs">
                          <FontAwesomeIcon icon={faGlobe} />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Platforms</span>
                      </div>
                      <DialogTitle className="text-xl font-bold text-slate-900 dark:text-white">
                        Add a platform
                      </DialogTitle>
                      <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Create a separate workspace for an agency. Its owner gets an email to set up their account.
                      </DialogDescription>
                    </div>

                    <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                      {/* Section 1: Platform Identity */}
                      <div className="space-y-3.5">
                        <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-slate-800">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-200">1. Platform details</span>
                        </div>
                        <div className="grid gap-3.5">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                              Business / Platform Name <span className="text-rose-500">*</span>
                            </label>
                            <Input
                              className="h-10"
                              value={newPlatform.name}
                              onChange={e => setNewPlatform({...newPlatform, name: e.target.value})}
                              placeholder="e.g. Skyline Real Estate Ltd"
                              required
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                              Subdomain / Routing Slug <span className="text-rose-500">*</span>
                            </label>
                            <div className="relative">
                              <Input
                                className="h-10 font-mono text-xs"
                                value={newPlatform.slug}
                                onChange={e => setNewPlatform({...newPlatform, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')})}
                                placeholder="e.g. skyline-properties"
                                required
                              />
                            </div>
                            <p className="text-[11px] text-slate-400 font-mono">
                              Tenant access URL: <span className="text-slate-600 dark:text-slate-300 font-medium">{window.location.origin}/p/{newPlatform.slug || 'slug'}</span>
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Section 2: Master Admin Credentials */}
                      <div className="space-y-3.5 pt-2">
                        <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-slate-800">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-200">2. Owner</span>
                        </div>
                        <div className="grid gap-3.5">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                              Owner's email <span className="text-rose-500">*</span>
                            </label>
                            <Input
                              className="h-10"
                              type="email"
                              value={newPlatform.ownerEmail}
                              onChange={e => setNewPlatform({...newPlatform, ownerEmail: e.target.value})}
                              placeholder="admin@skylineproperties.com"
                              required
                            />
                          </div>

                          <p className="text-[11px] text-slate-500">
                            The owner gets an email with a private link to set up their account. It works once and expires in 7 days.
                          </p>
                        </div>
                      </div>

                      {/* Security Notice */}
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-start gap-2.5">
                        <FontAwesomeIcon icon={faShieldAlt} className="h-3.5 w-3.5 text-slate-500 mt-0.5 shrink-0" />
                        <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          The platform's data is kept separate from every other platform. The owner's invitation email is sent straight away.
                        </div>
                      </div>
                    </div>

                    <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-xl font-semibold text-xs cursor-pointer"
                        onClick={() => setIsAddPlatformOpen(false)}
                        disabled={isProvisioning}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="rounded-xl font-bold text-xs cursor-pointer"
                        onClick={async () => {
                          setIsProvisioning(true);
                          try {
                            await handleAddPlatform();
                          } finally {
                            setIsProvisioning(false);
                          }
                        }}
                        disabled={isProvisioning || !newPlatform.name || !newPlatform.slug || !newPlatform.ownerEmail}
                      >
                        {isProvisioning ? (
                          <>
                            <FontAwesomeIcon icon={faSpinner} className="animate-spin mr-1.5 h-3 w-3" />
                            Creating…
                          </>
                        ) : (
                          'Add platform'
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Provision Success Modal */}
                <Dialog open={!!provisionedPlatform} onOpenChange={(open) => { if (!open) setProvisionedPlatform(null); }}>
                  <DialogContent className="sm:max-w-lg p-0 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
                    <div className="bg-slate-900 text-white p-6 relative">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                          <FontAwesomeIcon icon={faCheckCircle} className="h-5 w-5" />
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Platform created</span>
                          <h3 className="text-lg font-bold tracking-tight text-white">{provisionedPlatform?.name}</h3>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 mt-2">
                        The platform is ready. We've emailed the owner a link to set up their account.
                      </p>
                    </div>

                    <div className="p-6 space-y-4">
                      <div className="space-y-3">
                        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Platform link</span>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-mono font-semibold text-slate-900 dark:text-white truncate">
                              {window.location.origin}/p/{provisionedPlatform?.slug}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px] font-semibold shrink-0 cursor-pointer"
                              onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/p/${provisionedPlatform?.slug}`);
                                toast.success('Link copied');
                              }}
                            >
                              Copy Link
                            </Button>
                          </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Owner</span>
                          <p className="text-xs font-semibold text-slate-900 dark:text-white">
                            {provisionedPlatform?.ownerEmail}
                          </p>
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 text-amber-800 dark:text-amber-300 text-xs leading-relaxed">
                        The owner's setup link works once and expires in 7 days. You can resend it from Pending invites.
                      </div>

                      <Button
                        className="w-full h-10 font-bold text-xs cursor-pointer"
                        onClick={() => setProvisionedPlatform(null)}
                      >
                        Done
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Overview (real numbers from /admin/overview) ── */}
      {(activeTab === 'dashboard' || !activeTab) && (
        <div className="px-4 pt-6 sm:px-6 md:px-8">
          <AdminOverview
            firstName={(profile.displayName || 'there').split(' ')[0]}
            platformId={dashboardPlatformId ?? 'all'}
            isSuperAdmin={Boolean(profile.isSuperAdmin)}
            onNavigate={(tab) => setActiveTab(tab)}
            onInviteUser={() => {
              setActiveTab('registered');
              setIsInviteUserOpen(true);
            }}
            onAddProperty={() => {
              setActiveTab('properties');
              setIsAddPropertyOpen(true);
            }}
          />
        </div>
      )}

      {/* Tab Panels */}
      <div className="mt-3 px-3 sm:mt-4 sm:px-6">
        {/* ── USERS TAB ── */}
        {activeTab === 'registered' && (
          <Card className="border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs overflow-hidden">
            <CardHeader className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="max-sm:hidden">
                  <CardTitle className="text-lg font-bold text-slate-900 dark:text-white">Users</CardTitle>
                  <CardDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Search by name or email, filter by role, and manage access.
                  </CardDescription>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <div className="flex w-full items-stretch gap-2 sm:w-auto sm:items-center">
                    <div className="relative w-full sm:max-w-xs">
                      <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                      <Input 
                        placeholder="Search users..." 
                        className="h-9 pl-8 text-xs font-semibold rounded-xl" 
                        value={userSearch} 
                        onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }} 
                      />
                    </div>
                    <select
                      className="h-9 w-32 shrink-0 cursor-pointer rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-slate-900/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:w-auto"
                      value={userRoleFilter}
                      onChange={(e) => { setUserRoleFilter(e.target.value); setUserPage(1); }}
                    >
                      <option value="all">All Roles</option>
                      <option value="admin">Platform Admins</option>
                      <option value="landlord">Landlords</option>
                      <option value="tenant">Tenants</option>
                      <option value="hunter">Hunters</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <Dialog open={isInviteUserOpen} onOpenChange={setIsInviteUserOpen}>
                      <DialogTrigger render={
                        <Button size="sm" className="rounded-xl font-bold text-xs gap-1.5 cursor-pointer">
                          <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                          Invite User
                        </Button>
                      } />
                      <DialogContent className="sm:max-w-md p-0 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
                        <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                          <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">Invite a user</DialogTitle>
                          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            We'll email them a link to set up their account. The link expires in 7 days.
                          </DialogDescription>
                        </div>
                        <div className="p-6 space-y-3.5 max-h-[70vh] overflow-y-auto">
                          {profile.isSuperAdmin && (
                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Platform</label>
                              <select
                                className="h-10 w-full rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-slate-900/10 cursor-pointer"
                                value={selectedPlatformId}
                                onChange={(e) => setSelectedPlatformId(e.target.value)}
                              >
                                <option value="all">No platform</option>
                                {platforms.map((platform) => (
                                  <option key={platform.id} value={platform.id}>{platform.name}</option>
                                ))}
                              </select>
                            </div>
                          )}
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Full Name</label>
                            <Input className="h-10" value={inviteForm.displayName} onChange={e => setInviteForm({...inviteForm, displayName: e.target.value})} placeholder="e.g. Jane Doe" />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Email Address</label>
                            <Input className="h-10" type="email" value={inviteForm.email} onChange={e => setInviteForm({...inviteForm, email: e.target.value})} placeholder="e.g. jane@example.com" />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Assigned Role</label>
                            <select className="h-10 w-full rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-slate-900/10" value={inviteForm.role} onChange={e => setInviteForm({...inviteForm, role: e.target.value as UserRole})}>
                              <option value="landlord">Landlord</option>
                              <option value="tenant">Tenant</option>
                              <option value="hunter">Hunter</option>
                              {(profile.isSuperAdmin || profile.isAdmin) && <option value="admin">Platform Admin</option>}
                            </select>
                          </div>

                          {inviteForm.role === 'landlord' && profile.isAdmin && (
                            <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 p-3.5 space-y-3 bg-slate-50 dark:bg-slate-800/40">
                              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Rent Payment Routing</h4>
                              <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Settlement Beneficiary</label>
                                <select 
                                  className="h-9 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs font-semibold outline-none" 
                                  value={inviteForm.rentRouting} 
                                  onChange={e => setInviteForm({...inviteForm, rentRouting: e.target.value as 'admin' | 'direct'})}
                                >
                                  <option value="admin">Centralized Platform Account</option>
                                  <option value="direct">Direct Landlord Account</option>
                                </select>
                              </div>

                              {inviteForm.rentRouting === 'direct' && (
                                <>
                                  <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Payout Method</label>
                                    <select 
                                      className="h-9 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs font-semibold outline-none" 
                                      value={inviteForm.rentPayoutMethod} 
                                      onChange={e => setInviteForm({...inviteForm, rentPayoutMethod: e.target.value as 'mpesa' | 'bank' | 'cash'})}
                                    >
                                      <option value="mpesa">M-Pesa</option>
                                      <option value="bank">Bank Transfer</option>
                                      <option value="cash">Cash / Manual</option>
                                    </select>
                                  </div>
                                  {inviteForm.rentPayoutMethod === 'mpesa' && (
                                    <div className="space-y-1.5">
                                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">M-Pesa Settlement Phone / Till Number</label>
                                      <Input className="h-9 text-xs" value={inviteForm.mpesaSettlementPhone || ''} onChange={e => setInviteForm({...inviteForm, mpesaSettlementPhone: e.target.value})} placeholder="e.g. 254700000000 or Till No" />
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" className="font-semibold text-xs rounded-xl" onClick={() => setIsInviteUserOpen(false)}>Cancel</Button>
                          <Button size="sm" className="font-bold text-xs rounded-xl" onClick={handleInviteUser} disabled={busyAction !== null}>Send Invitation</Button>
                        </div>
                      </DialogContent>
                    </Dialog>

                    <Dialog open={isUpdateRoleOpen} onOpenChange={setIsUpdateRoleOpen}>
                      <DialogContent className="sm:max-w-md p-0 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
                        <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                          <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">Update Access Role</DialogTitle>
                          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Choose what {selectedUserForRole?.displayName} can do.
                          </DialogDescription>
                        </div>
                        <div className="p-6 space-y-3.5">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Assigned Role Tier</label>
                            <select className="h-10 w-full rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs font-semibold outline-none" value={updateRoleForm.role} onChange={e => setUpdateRoleForm({ role: e.target.value })}>
                              <option value="landlord">Landlord</option>
                              <option value="tenant">Tenant</option>
                              <option value="hunter">Hunter</option>
                              {(profile.isSuperAdmin || profile.isAdmin) && <option value="admin">Platform Admin</option>}
                              {profile.isSuperAdmin && <option value="superadmin">Super Admin</option>}
                            </select>
                          </div>
                        </div>
                        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" className="font-semibold text-xs rounded-xl" onClick={() => setIsUpdateRoleOpen(false)}>Cancel</Button>
                          <Button size="sm" className="font-bold text-xs rounded-xl" onClick={handleUpdateRole} disabled={busyAction !== null}>Save Role</Button>
                        </div>
                      </DialogContent>
                    </Dialog>

                    <Button variant="outline" size="sm" className="rounded-xl font-semibold text-xs" onClick={handleBulkExportUsers}>
                      <FontAwesomeIcon icon={faDownload} className="mr-1.5 h-3 w-3 text-slate-400" />
                      Export CSV
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {selectedUserIds.length > 0 && (
                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/60 p-3 mx-4 my-3 rounded-xl border border-slate-200/80 dark:border-slate-700">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{selectedUserIds.length} users selected</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={handleBulkExportUsers} className="h-7 text-xs font-semibold">Export</Button>
                    <Button size="sm" variant="outline" onClick={handleBulkPauseUsers} disabled={busyAction !== null} className="h-7 text-xs font-semibold text-amber-700">Pause / Resume</Button>
                    <Button size="sm" variant="outline" onClick={handleBulkDeleteUsers} disabled={busyAction !== null} className="h-7 text-xs font-semibold text-rose-600 border-rose-200">Delete</Button>
                  </div>
                </div>
              )}
                <Table className="max-sm:[&_td]:px-2.5 max-sm:[&_th]:px-2.5">
                  <TableHeader>
                    <TableRow className="bg-slate-50/70 dark:bg-slate-800/40">
                      <TableHead className="hidden w-10 px-4 sm:table-cell"><Checkbox checked={currentUsers.length > 0 && selectedUserIds.length === currentUsers.length} onCheckedChange={toggleAllUsers} /></TableHead>
                      <TableHead className="px-4 py-3">Name</TableHead>
                      <TableHead className="px-4 py-3 hidden sm:table-cell">Email Address</TableHead>
                      <TableHead className="px-4 py-3">Access Level</TableHead>
                      {profile.isSuperAdmin && <TableHead className="px-4 py-3 hidden lg:table-cell">Platform</TableHead>}
                      <TableHead className="px-4 py-3 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentUsers.map((u, i) => (
                      <TableRow key={i} className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors ${selectedUserIds.includes(u.uid) ? 'bg-slate-50 dark:bg-slate-800/40' : ''}`}>
                        <TableCell className="hidden px-4 sm:table-cell"><Checkbox checked={selectedUserIds.includes(u.uid)} onCheckedChange={() => toggleUserSelection(u.uid)} /></TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center text-xs font-bold shrink-0 border border-slate-200/60 dark:border-slate-700">
                              {u.displayName?.charAt(0) ?? '?'}
                            </div>
                            <span className="max-w-24 truncate font-semibold text-xs text-slate-900 dark:text-white sm:max-w-none">{u.displayName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-xs text-slate-500 font-normal hidden sm:table-cell">{u.email}</TableCell>
                        <TableCell className="px-4 py-3">
                          <Badge variant={u.isSuperAdmin ? 'destructive' : u.role === 'admin' ? 'warning' : u.role === 'landlord' ? 'indigo' : u.role === 'tenant' ? 'success' : 'purple'}>
                            {u.isSuperAdmin ? 'Super Admin' : u.role}
                          </Badge>
                        </TableCell>
                        {profile.isSuperAdmin && (
                          <TableCell className="px-4 py-3 text-xs text-slate-500 font-medium hidden lg:table-cell">
                            {platforms.find(p => p.id === u.platformId)?.name || 'Root Platform'}
                          </TableCell>
                        )}
                        <TableCell className="px-4 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger render={
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer">
                                <FontAwesomeIcon icon={faEllipsisVertical} className="h-3.5 w-3.5" />
                              </Button>
                            } />
                            <DropdownMenuContent align="end" className="w-48 rounded-xl p-1 shadow-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
                              <DropdownMenuLabel className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator className="my-1 bg-slate-100 dark:bg-slate-800" />
                              {onImpersonate && !u.isSuperAdmin && u.uid !== profile.uid && (
                                <DropdownMenuItem onClick={() => onImpersonate(u)} className="text-xs font-semibold cursor-pointer rounded-lg px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
                                  <FontAwesomeIcon icon={faEye} className="mr-2 h-3.5 w-3.5 text-slate-400" /> View as this user
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => { setSelectedUserForRole(u); setUpdateRoleForm({ role: u.role }); setIsUpdateRoleOpen(true); }} className="text-xs font-semibold cursor-pointer rounded-lg px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
                                <FontAwesomeIcon icon={faUserShield} className="mr-2 h-3.5 w-3.5 text-slate-400" /> Change Role
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handlePauseAccount(u)} className="text-xs font-semibold cursor-pointer rounded-lg px-2.5 py-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20">
                                <FontAwesomeIcon icon={u.status === 'suspended' ? faCheckCircle : faTimesCircle} className="mr-2 h-3.5 w-3.5" /> {u.status === 'suspended' ? 'Activate Account' : 'Pause Access'}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDeleteAccount(u)} className="text-xs font-semibold cursor-pointer rounded-lg px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20">
                                <FontAwesomeIcon icon={faTrash} className="mr-2 h-3.5 w-3.5" /> Delete Account
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                    {users.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={profile.isSuperAdmin ? 6 : 5} className="h-32 text-center text-slate-400 font-medium text-xs">
                          No identity nodes matched the current filter criteria.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              
              {/* Pagination Controls */}
              {totalUserPages > 1 && (
                <div className="flex items-center justify-between p-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20">
                  <span className="text-xs text-slate-500 font-medium pl-2">
                    Showing {indexOfFirstUser + 1} to {Math.min(indexOfLastUser, users.length)} of {users.length} users
                  </span>
                  <div className="flex items-center gap-1.5 pr-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-lg h-7 w-7 p-0"
                      disabled={userPage === 1}
                      onClick={() => setUserPage(p => Math.max(1, p - 1))}
                    >
                      <FontAwesomeIcon icon={faChevronLeft} className="h-2.5 w-2.5" />
                    </Button>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 min-w-[20px] text-center">{userPage}</span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-lg h-7 w-7 p-0"
                      disabled={userPage === totalUserPages}
                      onClick={() => setUserPage(p => Math.min(totalUserPages, p + 1))}
                    >
                      <FontAwesomeIcon icon={faChevronRight} className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── PENDING TAB ── */}
        {activeTab === 'pending' && (
          <Card className="border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs overflow-hidden">
            <CardHeader className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="max-sm:hidden">
                <CardTitle className="text-lg font-bold text-slate-900 dark:text-white">Pending invites</CardTitle>
                <CardDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  They have an invitation email but haven't set up their account. Links expire after 7 days.
                </CardDescription>
              </div>
              <div className="relative w-full sm:max-w-xs shrink-0">
                <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                <Input 
                  placeholder="Search invitations..." 
                  className="h-9 pl-8 text-xs font-semibold rounded-xl" 
                  value={inviteSearch} 
                  onChange={(e) => { setInviteSearch(e.target.value); setInvitePage(1); }} 
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table className="max-sm:[&_td]:px-2.5 max-sm:[&_th]:px-2.5">
                <TableHeader>
                  <TableRow className="bg-slate-50/70 dark:bg-slate-800/40">
                    <TableHead className="px-4 py-3">Name</TableHead>
                    <TableHead className="hidden px-4 py-3 sm:table-cell">Email</TableHead>
                    <TableHead className="px-4 py-3">Role</TableHead>
                    {profile.isSuperAdmin && <TableHead className="hidden px-4 py-3 lg:table-cell">Platform</TableHead>}
                    <TableHead className="px-4 py-3 text-right"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedInvs.map((inv, i) => (
                    <TableRow key={i} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                      <TableCell className="px-4 py-3 text-xs font-semibold text-slate-900 dark:text-white">{inv.displayName}</TableCell>
                      <TableCell className="hidden px-4 py-3 text-xs font-normal text-slate-500 sm:table-cell">{inv.email}</TableCell>
                      <TableCell className="px-4 py-3"><Badge variant="secondary">{inv.role}</Badge></TableCell>
                      {profile.isSuperAdmin && (
                        <TableCell className="hidden px-4 py-3 text-xs font-medium text-slate-500 lg:table-cell">
                          {platforms.find(p => p.id === inv.platformId)?.name || 'No platform'}
                        </TableCell>
                      )}
                      <TableCell className="px-4 py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg text-xs font-semibold"
                          disabled={resendingEmail === inv.email}
                          onClick={() => handleResendInvite(inv.email)}
                        >
                          {resendingEmail === inv.email ? <FontAwesomeIcon icon={faSpinner} className="h-3 w-3 animate-spin" /> : <><span className="sm:hidden">Resend</span><span className="hidden sm:inline">Resend invite</span></>}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {paginatedInvs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={profile.isSuperAdmin ? 5 : 4} className="h-32 text-center text-slate-400 font-medium text-xs">
                        No pending invites. Use "Invite user" on the Users page to add someone.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {totalInvitePages > 1 && (
                <div className="flex items-center justify-between p-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20">
                  <span className="text-xs text-slate-500 font-medium pl-2">
                    Page {invitePage} of {totalInvitePages}
                  </span>
                  <div className="flex items-center gap-1.5 pr-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-lg h-7 w-7 p-0"
                      disabled={invitePage === 1}
                      onClick={() => setInvitePage(p => Math.max(1, p - 1))}
                    >
                      <FontAwesomeIcon icon={faChevronLeft} className="h-2.5 w-2.5" />
                    </Button>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 min-w-[20px] text-center">{invitePage}</span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-lg h-7 w-7 p-0"
                      disabled={invitePage === totalInvitePages}
                      onClick={() => setInvitePage(p => Math.min(totalInvitePages, p + 1))}
                    >
                      <FontAwesomeIcon icon={faChevronRight} className="h-2.5 w-2.5" />
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
                <div className="max-sm:hidden">
                  <CardTitle className="text-xl font-black">Properties</CardTitle>
                  <CardDescription className="font-medium text-zinc-500">Every unit with its landlord, price and status.</CardDescription>
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
                      <DialogTrigger render={<Button className="gap-1 rounded-xl bg-zinc-100 px-2 font-bold text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 sm:gap-2 sm:px-3" />}>
                        <FontAwesomeIcon icon={faTools} className="h-3 w-3 sm:mr-2" />
                        <span className="sm:hidden">Bulk</span><span className="hidden sm:inline">Bulk Add</span>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[700px] p-0 rounded-3xl border-none bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
                          <DialogTitle className="text-xl font-black">Bulk Add Units</DialogTitle>
                          <DialogDescription className="font-medium text-zinc-500">Add several units to a building at once.</DialogDescription>
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
                          <Button onClick={handleBulkAddProperties} disabled={busyAction !== null} className="bg-zinc-950 text-white hover:bg-zinc-800">Generate {bulkAddForm.count} Units</Button>
                        </div>
                      </DialogContent>
                    </Dialog>

                    <Dialog open={isAddBuildingOpen} onOpenChange={setIsAddBuildingOpen}>
                      <DialogTrigger render={<Button className="gap-1 rounded-xl bg-zinc-100 px-2 font-bold text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 sm:gap-2 sm:px-3" />}>
                        <FontAwesomeIcon icon={faPlus} className="h-3 w-3 sm:mr-2" />
                        Building
                      </DialogTrigger>
                      <DialogContent className="rounded-3xl border-none shadow-2xl bg-white dark:bg-zinc-900">
                        <DialogHeader>
                          <DialogTitle className="text-xl font-black">Add New Building</DialogTitle>
                          <DialogDescription className="font-medium text-zinc-500">Group units under one building.</DialogDescription>
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
                          <MapPicker
                            value={buildingForm.latitude === null || buildingForm.longitude === null ? null : { latitude: buildingForm.latitude, longitude: buildingForm.longitude }}
                            onChange={({ latitude, longitude }) => setBuildingForm({ ...buildingForm, latitude, longitude })}
                            onClear={() => setBuildingForm({ ...buildingForm, latitude: null, longitude: null })}
                          />
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
                            <Button className="font-black rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-900 h-12 px-6" onClick={handleAddBuilding} disabled={busyAction !== null}>Add Building</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      <Dialog open={isEditBuildingOpen} onOpenChange={setIsEditBuildingOpen}>
                        <DialogContent className="rounded-3xl border-none shadow-2xl bg-white dark:bg-zinc-900">
                          <DialogHeader>
                            <DialogTitle className="text-xl font-black">Edit building</DialogTitle>
                            <DialogDescription className="font-medium text-zinc-500">Change the building's name or address.</DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Building name *</label>
                              <Input className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800" value={editBuildingForm.name} onChange={e => setEditBuildingForm({...editBuildingForm, name: e.target.value})} placeholder="e.g. Sunset Apartments" />
                            </div>
                            <div className="grid gap-2">
                              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Address / Location</label>
                              <Input className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800" value={editBuildingForm.address} onChange={e => setEditBuildingForm({...editBuildingForm, address: e.target.value})} placeholder="123 Sunset Blvd" />
                            </div>
                            <MapPicker
                              value={editBuildingForm.latitude === null || editBuildingForm.longitude === null ? null : { latitude: editBuildingForm.latitude, longitude: editBuildingForm.longitude }}
                              onChange={({ latitude, longitude }) => setEditBuildingForm({ ...editBuildingForm, latitude, longitude })}
                              onClear={() => setEditBuildingForm({ ...editBuildingForm, latitude: null, longitude: null })}
                            />
                          </div>
                          <DialogFooter>
                            <Button variant="ghost" className="font-bold rounded-xl h-12" onClick={() => setIsEditBuildingOpen(false)}>Cancel</Button>
                            <Button className="font-black rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-900 h-12 px-6" onClick={handleUpdateBuilding} disabled={busyAction !== null}>Save Changes</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      <Dialog open={isAddPropertyOpen} onOpenChange={setIsAddPropertyOpen}>
                      <DialogTrigger render={<Button className="gap-1 rounded-xl bg-zinc-950 px-2 font-bold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-955 sm:gap-2 sm:px-3" />}>
                        <FontAwesomeIcon icon={faPlus} className="h-3 w-3 sm:mr-2" />
                        <span className="sm:hidden">Add</span><span className="hidden sm:inline">Property</span>
                      </DialogTrigger>
                      <DialogContent className="rounded-3xl border-none shadow-2xl bg-white dark:bg-zinc-900 max-w-[500px]">
                        <DialogHeader>
                          <DialogTitle className="text-xl font-black">Add New Property</DialogTitle>
                          <DialogDescription className="font-medium text-zinc-500">Add a single unit.</DialogDescription>
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
                          <Button className="font-black rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-900 h-12 px-6" onClick={handleAddProperty} disabled={busyAction !== null}>Add Property</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table className="max-sm:[&_td]:px-2.5 max-sm:[&_th]:px-2.5">
                <TableHeader>
                  <TableRow className="bg-zinc-50/50 dark:bg-zinc-800/50 hover:bg-transparent border-none">
                    <TableHead className="px-3 py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400 sm:px-8">Property</TableHead>
                    <TableHead className="hidden py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400 md:table-cell">Coordinates</TableHead>
                    <TableHead className="hidden py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400 md:table-cell">Valuation</TableHead>
                    <TableHead className="hidden py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400 sm:table-cell">Status</TableHead>
                    {profile.isSuperAdmin && <TableHead className="hidden py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400 lg:table-cell">Platform</TableHead>}
                    <TableHead className="px-2 py-4 text-right font-black text-[10px] uppercase tracking-widest text-zinc-400 sm:px-8"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedProps.map((p, i) => (
                    <TableRow key={i} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors border-zinc-50 dark:border-zinc-800">
                      <TableCell className="max-w-[11rem] whitespace-normal px-3 py-4 text-sm font-bold sm:max-w-none sm:whitespace-nowrap sm:px-8 sm:py-5">{p.title}</TableCell>
                      <TableCell className="hidden text-xs font-medium md:table-cell">{p.location}</TableCell>
                      <TableCell className="hidden text-xs font-black text-zinc-700 md:table-cell">KES {p.price?.toLocaleString()}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="outline" className={`rounded-lg px-2 py-0.5 font-black uppercase text-[9px] border-none ${p.status === 'available' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                          {p.status}
                        </Badge>
                      </TableCell>
                      {profile.isSuperAdmin && (
                        <TableCell className="hidden text-[10px] font-black uppercase tracking-tighter text-zinc-400 lg:table-cell">
                          {platforms.find(plat => plat.id === p.platformId)?.name || 'No platform'}
                        </TableCell>
                      )}
                      <TableCell className="px-2 py-4 text-right sm:px-8 sm:py-5">
                        <div className="flex items-center justify-end gap-0 sm:gap-2">
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
              <CardTitle className="text-xl font-black">Buildings</CardTitle>
              <CardDescription className="font-medium text-zinc-500">Buildings and the units inside them.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table className="max-sm:[&_td]:px-2.5 max-sm:[&_th]:px-2.5">
                <TableHeader>
                  <TableRow className="bg-zinc-50/50 dark:bg-zinc-800/50 hover:bg-transparent border-none">
                    <TableHead className="px-3 py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400 sm:px-8">Building</TableHead>
                    <TableHead className="hidden py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400 sm:table-cell">Location</TableHead>
                    <TableHead className="hidden py-4 font-black text-[10px] uppercase tracking-widest text-zinc-400 sm:table-cell">Units</TableHead>
                    <TableHead className="px-2 py-4 text-right font-black text-[10px] uppercase tracking-widest text-zinc-400 sm:px-8"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buildingPager.pageItems.map((b, i) => {
                    const unitCount = properties.filter(p => p.buildingId === b.id).length;
                    return (
                      <TableRow key={i} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors border-zinc-50 dark:border-zinc-800">
                        <TableCell className="max-w-[13rem] whitespace-normal px-3 py-4 text-sm font-bold sm:max-w-none sm:whitespace-nowrap sm:px-8 sm:py-5">{b.name}</TableCell>
                        <TableCell className="hidden text-xs font-medium sm:table-cell">{b.address}</TableCell>
                        <TableCell className="hidden text-xs font-black text-zinc-700 sm:table-cell">{unitCount}</TableCell>
                        <TableCell className="px-2 py-4 text-right sm:px-8 sm:py-5">
                          <div className="flex items-center justify-end gap-0 sm:gap-2">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Edit Building"
                              onClick={() => {
                                setEditBuildingForm({
                                  id: b.id,
                                  name: b.name,
                                  address: b.address || '',
                                  latitude: b.latitude == null ? null : Number(b.latitude),
                                  longitude: b.longitude == null ? null : Number(b.longitude),
                                });
                                setIsEditBuildingOpen(true);
                              }}
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
              <div className="px-4 pb-4 sm:px-8">
                <Pagination page={buildingPager.page} pageCount={buildingPager.pageCount} total={buildingPager.total} pageSize={buildingPager.pageSize} onPageChange={buildingPager.setPage} label="buildings" />
              </div>
            </CardContent>
          </Card>
          </div>
        )}

        {/* ── NETWORK TAB ── */}
        {activeTab === 'platforms' && profile.isSuperAdmin && (
          <Card className="border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs overflow-hidden">
            <CardHeader className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="max-sm:hidden">
                <CardTitle className="text-lg font-bold text-slate-900 dark:text-white">Platforms</CardTitle>
                <CardDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Agencies with their own workspace. Suspend or reactivate them here.
                </CardDescription>
              </div>
              <div className="relative w-full sm:max-w-xs shrink-0">
                <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                <Input 
                  placeholder="Search platforms..." 
                  className="h-9 pl-8 text-xs font-semibold rounded-xl" 
                  value={platformSearch} 
                  onChange={(e) => { setPlatformSearch(e.target.value); setPlatformPage(1); }} 
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table className="max-sm:[&_td]:px-2.5 max-sm:[&_th]:px-2.5">
                <TableHeader>
                  <TableRow className="bg-slate-50/70 dark:bg-slate-800/40">
                    <TableHead className="px-4 py-3">Platform</TableHead>
                    <TableHead className="hidden px-4 py-3 sm:table-cell">Link name</TableHead>
                    <TableHead className="hidden px-4 py-3 md:table-cell">Owner</TableHead>
                    <TableHead className="px-4 py-3">Status</TableHead>
                    <TableHead className="text-right px-4 py-3">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPlats.map((plat) => (
                    <TableRow key={plat.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                      <TableCell className="px-4 py-3 font-semibold text-xs text-slate-900 dark:text-white">{plat.name}</TableCell>
                      <TableCell className="hidden px-4 py-3 text-xs font-mono text-slate-600 dark:text-slate-300 sm:table-cell">
                        <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px]">
                          {plat.slug}
                        </span>
                      </TableCell>
                      <TableCell className="hidden px-4 py-3 text-xs font-normal text-slate-500 md:table-cell">{plat.ownerEmail}</TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge variant={plat.status === 'active' ? 'success' : 'destructive'}>
                          {plat.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right px-4 py-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs font-semibold rounded-lg"
                          onClick={() => togglePlatformStatus(plat.id, plat.status)}
                        >
                          {plat.status === 'active' ? 'Suspend' : 'Activate'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {paginatedPlats.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-slate-400 font-medium text-xs">
                        No platform lease instances found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {totalPlatformPages > 1 && (
                <div className="flex items-center justify-between p-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20">
                  <span className="text-xs text-slate-500 font-medium pl-2">
                    Page {platformPage} of {totalPlatformPages}
                  </span>
                  <div className="flex items-center gap-1.5 pr-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-lg h-7 w-7 p-0"
                      disabled={platformPage === 1}
                      onClick={() => setPlatformPage(p => Math.max(1, p - 1))}
                    >
                      <FontAwesomeIcon icon={faChevronLeft} className="h-2.5 w-2.5" />
                    </Button>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 min-w-[20px] text-center">{platformPage}</span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-lg h-7 w-7 p-0"
                      disabled={platformPage === totalPlatformPages}
                      onClick={() => setPlatformPage(p => Math.min(totalPlatformPages, p + 1))}
                    >
                      <FontAwesomeIcon icon={faChevronRight} className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── AUDIT LOG TAB ── */}
        {activeTab === 'audit' && profile.isSuperAdmin && (
          <Card className="border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs overflow-hidden">
            <CardHeader className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800">
              <div className="flex flex-col xl:flex-row xl:items-center gap-4 justify-between">
                <div className="max-sm:hidden">
                  <CardTitle className="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                    <FontAwesomeIcon icon={faClipboardList} className="h-4 w-4 text-slate-400" />
                    System Audit Trail
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Important actions by admins and users, newest first.
                  </CardDescription>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <div className="relative w-full sm:max-w-xs shrink-0">
                    <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                    <Input 
                      placeholder="Search audit events..." 
                      className="h-9 pl-8 text-xs font-semibold rounded-xl" 
                      value={auditSearch} 
                      onChange={(e) => { setAuditSearch(e.target.value); setAuditLogPage(1); }} 
                    />
                  </div>
                  {/* User filter */}
                  <div className="relative">
                    <select
                      className="h-9 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3 pr-8 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-slate-900/10 cursor-pointer"
                      value={auditUserId}
                      onChange={e => { setAuditUserId(e.target.value); setAuditLogPage(1); }}
                    >
                      <option value="all">All Actors</option>
                      {users.map(u => (
                        <option key={u.uid} value={u.uid}>{u.displayName} ({u.email})</option>
                      ))}
                    </select>
                  </div>

                  <Button variant="outline" size="sm" className="gap-1.5 rounded-xl h-9 text-xs font-semibold" onClick={exportAuditCSV}>
                    <FontAwesomeIcon icon={faDownload} className="h-3 w-3 text-slate-400" />
                    Export CSV
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {auditLoading ? (
                <div className="flex items-center justify-center py-16 gap-3">
                  <FontAwesomeIcon icon={faSpinner} className="h-4 w-4 animate-spin text-slate-400" />
                  <span className="text-xs font-semibold text-slate-400">Loading audit trail...</span>
                </div>
              ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/70 dark:bg-slate-800/40">
                        <TableHead className="px-4 py-3">Timestamp</TableHead>
                        <TableHead className="px-4 py-3">User</TableHead>
                        <TableHead className="px-4 py-3">Action</TableHead>
                        <TableHead className="px-4 py-3">Resource</TableHead>
                        <TableHead className="px-4 py-3 text-right">Metadata</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedAudits.map((log) => (
                        <TableRow key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                          <TableCell className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                                {new Date(log.createdAt).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {new Date(log.createdAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center text-[10px] font-bold shrink-0">
                                {log.userEmail.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-[160px]">
                                {log.userEmail}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700">
                              {log.action.replace(/_/g, ' ')}
                            </span>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-xs text-slate-500 capitalize">
                            {log.resource || '—'}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right">
                            {log.metadata && Object.keys(log.metadata).length > 0 ? (
                              <details className="cursor-pointer inline-block text-left">
                                <summary className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 transition-colors list-none">
                                  View JSON
                                </summary>
                                <pre className="mt-1 text-[10px] bg-slate-50 dark:bg-slate-800 rounded-lg p-2 font-mono text-slate-700 dark:text-slate-300 max-w-xs overflow-x-auto border border-slate-200/80 dark:border-slate-700">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </details>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {paginatedAudits.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="h-32 text-center text-slate-400 font-medium text-xs">
                            No audit trail entries matched the filter criteria.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
              )}

              {totalAuditLogPages > 1 && (
                <div className="flex items-center justify-between p-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20">
                  <span className="text-xs text-slate-500 font-medium pl-2">
                    Page {auditLogPage} of {totalAuditLogPages}
                  </span>
                  <div className="flex items-center gap-1.5 pr-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-lg h-7 w-7 p-0"
                      disabled={auditLogPage === 1}
                      onClick={() => setAuditLogPage(p => Math.max(1, p - 1))}
                    >
                      <FontAwesomeIcon icon={faChevronLeft} className="h-2.5 w-2.5" />
                    </Button>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 min-w-[20px] text-center">{auditLogPage}</span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-lg h-7 w-7 p-0"
                      disabled={auditLogPage === totalAuditLogPages}
                      onClick={() => setAuditLogPage(p => Math.min(totalAuditLogPages, p + 1))}
                    >
                      <FontAwesomeIcon icon={faChevronRight} className="h-2.5 w-2.5" />
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
            <Button className="h-10 px-8 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-black" onClick={handleUpdateProfile} disabled={busyAction !== null}>Save Changes</Button>
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
            <Button className="h-10 px-8 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-black" onClick={handleAssignPropertyLandlord} disabled={busyAction !== null}>Save Assignment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Property Dialog */}
      <Dialog open={isEditPropertyOpen} onOpenChange={setIsEditPropertyOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto p-6 rounded-3xl border-none bg-white dark:bg-zinc-900 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Edit Property</DialogTitle>
            <DialogDescription className="font-medium text-zinc-500">Change the details shown to tenants and house hunters.</DialogDescription>
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
            <Button className="h-10 px-8 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-black" onClick={handleUpdateProperty} disabled={busyAction !== null}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
