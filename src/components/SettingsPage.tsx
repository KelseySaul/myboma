import { useState, useEffect } from 'react';
import { authClient } from '../lib/auth-client';
import { initPlatform, updatePlatformBranding, getPlatformBranding, updateMyProfile, uploadFile } from '../lib/api';
import { UserProfile, promptForPush } from '../App';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUser,
  faLock,
  faCamera,
  faPhone,
  faEnvelope,
  faMapMarkerAlt,
  faSave,
  faEye,
  faEyeSlash,
  faShieldAlt,
  faCheckCircle,
  faDesktop,
  faBell,
} from '@fortawesome/free-solid-svg-icons';

export default function SettingsPage({ profile }: { profile: UserProfile }) {
  /* ── Profile form ─────────────────────────────────────────── */
  const [profileForm, setProfileForm] = useState({
    displayName: profile.displayName || '',
    phone: profile.phone || '',
    address: profile.address || '',
    avatarUrl: profile.avatarUrl || '',
  });
  const [isUploading, setIsUploading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  /* ── Password form ────────────────────────────────────────── */
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [showOldPw, setShowOldPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);

  /* ── Preferences form ─────────────────────────────────────── */
  const [defaultPage, setDefaultPage] = useState(() => localStorage.getItem(`myboma_default_page_${profile.uid}`) || 'dashboard');
  const [savingPref, setSavingPref] = useState(false);
  const [prefSaved, setPrefSaved] = useState(false);

  const handleSavePref = () => {
    setSavingPref(true);
    localStorage.setItem(`myboma_default_page_${profile.uid}`, defaultPage);
    setTimeout(() => {
      setSavingPref(false);
      setPrefSaved(true);
      toast.success('Preferences updated!');
      setTimeout(() => setPrefSaved(false), 3000);
    }, 400);
  };

  /* ── Platform Branding form (Admin only) ──────────────────── */
  const [brandingForm, setBrandingForm] = useState({
    brandLogoUrl: '',
    brandPrimaryColor: '',
    brandSecondaryColor: '',
  });
  const [platformName, setPlatformName] = useState('');
  const [savingBranding, setSavingBranding] = useState(false);

  useEffect(() => {
    if (profile.role === 'admin') {
      if (profile.platformId) {
        getPlatformBranding(profile.platformId)
          .then((data) => {
            setPlatformName(data.name || '');
            setBrandingForm({
              brandLogoUrl: data.brandLogoUrl || '',
              brandPrimaryColor: data.brandPrimaryColor || '',
              brandSecondaryColor: data.brandSecondaryColor || '',
            });
          })
          .catch(() => {});
      } else {
        // Init platform for this admin if missing
        initPlatform()
          .then((data) => {
            if (data.status === 'created') {
              toast.success('Platform initialized!');
              window.location.reload();
            }
          })
          .catch(console.error);
      }
    }
  }, [profile]);

  const handleSaveBranding = async () => {
    if (!profile.platformId) return;
    setSavingBranding(true);
    try {
      await updatePlatformBranding(profile.platformId, { ...brandingForm, name: platformName });
      toast.success('Branding updated successfully! Refresh the page to see changes.');
    } catch (err: any) {
      toast.error('Failed to update branding: ' + err.message);
    } finally {
      setSavingBranding(false);
    }
  };

  const getPageOptions = () => {
    const base = [{ id: 'dashboard', label: 'Dashboard' }];
    if (profile.role === 'admin') {
      base.push(
        { id: 'registered', label: 'Users' },
        { id: 'properties', label: 'Assets' },
        { id: 'finances', label: 'Finances' },
        { id: 'maintenance', label: 'Maintenance' },
        { id: 'tenants', label: 'Tenants' }
      );
    } else if (profile.role === 'landlord') {
      base.push(
        { id: 'properties', label: 'Units' },
        { id: 'finances', label: 'Finances' },
        { id: 'tenants', label: 'Tenants' }
      );
    } else if (profile.role === 'tenant') {
      base.push(
        { id: 'payments', label: 'Payments' },
        { id: 'maintenance', label: 'Maintenance' }
      );
    }
    return base;
  };

  /* ── Handlers ─────────────────────────────────────────────── */
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const { url } = await uploadFile(file, file.name, 'avatar');
      setProfileForm(prev => ({ ...prev, avatarUrl: url }));
      await updateMyProfile({ avatarUrl: url });
      toast.success('Avatar updated!');
    } catch {
      toast.error('Failed to upload avatar');
    } finally {
      setIsUploading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile.platformId) return;
    setSavingBranding(true);
    try {
      const { url } = await uploadFile(file, file.name, `platforms/${profile.platformId}`);
      setBrandingForm(prev => ({ ...prev, brandLogoUrl: url }));
      toast.success('Logo uploaded!');
    } catch {
      toast.error('Failed to upload logo');
    } finally {
      setSavingBranding(false);
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileSaved(false);
    try {
      await updateMyProfile(profileForm);
      setProfileSaved(true);
      toast.success('Profile updated successfully!');
      setTimeout(() => setProfileSaved(false), 3000);
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordForm.oldPassword) {
      toast.error('Please enter your current password');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setSavingPassword(true);
    setPasswordSaved(false);
    try {
      // changePassword verifies currentPassword itself before setting newPassword.
      const { error } = await authClient.changePassword({
        currentPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword,
      });
      if (error) {
        throw new Error(error.message || 'Incorrect current password. Please try again.');
      }
      setPasswordSaved(true);
      toast.success('Password changed successfully!');
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setPasswordSaved(false), 3000);
    } catch (err: any) {
      toast.error(err.message || 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  const pwMatch = passwordForm.newPassword && passwordForm.confirmPassword
    && passwordForm.newPassword === passwordForm.confirmPassword;
  const pwMismatch = passwordForm.newPassword && passwordForm.confirmPassword
    && passwordForm.newPassword !== passwordForm.confirmPassword;

  return (
    <div className="db w-full min-w-0 pb-24 sm:pb-8 animate-in fade-in duration-300">
      {/* ── Page Header ─────────────────────────── */}
      <div className="p-6 md:p-8 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <FontAwesomeIcon icon={faUser} className="h-2.5 w-2.5" />
            Account Management
          </span>
          <span className="text-xs text-slate-400 font-medium">·</span>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Active session
          </span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Account Settings
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Manage your personal profile, credentials, notifications, and platform branding.
        </p>
      </div>

      <div className="px-6 md:px-8 mt-6 w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* ── Profile Card ──────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <FontAwesomeIcon icon={faUser} className="h-3 w-3" />
              Profile Information
            </h2>
            {profileSaved && (
              <Badge variant="success" className="gap-1 animate-in fade-in">
                <FontAwesomeIcon icon={faCheckCircle} className="h-2.5 w-2.5" /> Saved
              </Badge>
            )}
          </div>

          <div className="p-6 space-y-5">
            {/* Avatar row */}
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 border-2 border-white dark:border-slate-800 shadow-sm shrink-0 group cursor-pointer">
                <img
                  src={profileForm.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.uid}`}
                  alt="Profile"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white opacity-0 group-hover:opacity-100 cursor-pointer transition-all gap-0.5">
                  <FontAwesomeIcon icon={faCamera} className="h-3.5 w-3.5" />
                  <span className="text-[7px] font-bold uppercase tracking-wider">Edit</span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={isUploading} />
                </label>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-sm text-slate-900 dark:text-white">{profileForm.displayName || 'No name configured'}</p>
                <p className="text-xs text-slate-400 font-medium">{profile.email}</p>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  <FontAwesomeIcon icon={faShieldAlt} className="h-2 w-2 text-slate-400" />
                  {profile.isSuperAdmin ? 'Super Admin' : profile.role}
                </div>
                {isUploading && (
                  <p className="text-[9px] font-bold uppercase tracking-wider text-blue-600 animate-pulse">Uploading...</p>
                )}
              </div>
            </div>

            {/* Fields */}
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Display Name</label>
                <Input
                  className="h-10"
                  value={profileForm.displayName}
                  onChange={e => setProfileForm(prev => ({ ...prev, displayName: e.target.value }))}
                  placeholder="Your full name"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faEnvelope} className="h-2.5 w-2.5 text-slate-400" /> Email Address
                </label>
                <Input
                  className="h-10 bg-slate-50 dark:bg-slate-800/40 text-slate-400 cursor-not-allowed"
                  value={profile.email}
                  disabled
                />
                <p className="text-[10px] text-slate-400">Email is tied to your identity provider authentication</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faPhone} className="h-2.5 w-2.5 text-slate-400" /> Phone Number
                </label>
                <Input
                  className="h-10"
                  value={profileForm.phone}
                  onChange={e => setProfileForm(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+254 7XX XXX XXX"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faMapMarkerAlt} className="h-2.5 w-2.5 text-slate-400" /> Physical Address
                </label>
                <Textarea
                  className="rounded-xl resize-none text-xs min-h-[60px]"
                  rows={2}
                  value={profileForm.address}
                  onChange={e => setProfileForm(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="Street address, building, or city..."
                />
              </div>
            </div>

            <Button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              size="sm"
              className="h-9 px-6 rounded-xl font-bold text-xs gap-1.5"
            >
              <FontAwesomeIcon icon={profileSaved ? faCheckCircle : faSave} className="h-3 w-3" />
              {savingProfile ? 'Saving...' : profileSaved ? 'Saved!' : 'Save Profile'}
            </Button>
          </div>
        </div>

        {/* ── Security Card ─────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <FontAwesomeIcon icon={faLock} className="h-3 w-3" />
              Security — Change Password
            </h2>
            {passwordSaved && (
              <Badge variant="success" className="gap-1 animate-in fade-in">
                <FontAwesomeIcon icon={faCheckCircle} className="h-2.5 w-2.5" /> Updated
              </Badge>
            )}
          </div>

          <div className="p-6 space-y-4">
            <p className="text-xs text-slate-500 leading-relaxed">
              Choose a strong password at least 8 characters long to protect your account.
            </p>

            <div className="space-y-3.5">
              {/* Current password */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Current Password</label>
                <div className="relative">
                  <Input
                    type={showOldPw ? 'text' : 'password'}
                    className="h-10 pr-10"
                    value={passwordForm.oldPassword}
                    onChange={e => setPasswordForm(prev => ({ ...prev, oldPassword: e.target.value }))}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                  >
                    <FontAwesomeIcon icon={showOldPw ? faEyeSlash : faEye} className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* New password */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">New Password</label>
                <div className="relative">
                  <Input
                    type={showNewPw ? 'text' : 'password'}
                    className="h-10 pr-10"
                    value={passwordForm.newPassword}
                    onChange={e => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                  >
                    <FontAwesomeIcon icon={showNewPw ? faEyeSlash : faEye} className="h-3.5 w-3.5" />
                  </button>
                </div>
                {passwordForm.newPassword && passwordForm.newPassword.length < 8 && (
                  <p className="text-[10px] font-semibold text-amber-600">Minimum 8 characters required</p>
                )}
              </div>

              {/* Confirm password */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Confirm New Password</label>
                <div className="relative">
                  <Input
                    type={showConfirmPw ? 'text' : 'password'}
                    className={`h-10 pr-10 ${
                      pwMismatch ? 'border-rose-300 focus:ring-rose-200' :
                      pwMatch ? 'border-emerald-300 focus:ring-emerald-200' : ''
                    }`}
                    value={passwordForm.confirmPassword}
                    onChange={e => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                  >
                    <FontAwesomeIcon icon={showConfirmPw ? faEyeSlash : faEye} className="h-3.5 w-3.5" />
                  </button>
                </div>
                {pwMismatch && (
                  <p className="text-[10px] font-semibold text-rose-600">Passwords do not match</p>
                )}
                {pwMatch && (
                  <p className="text-[10px] font-semibold text-emerald-600">
                    <FontAwesomeIcon icon={faCheckCircle} className="mr-1" /> Passwords match
                  </p>
                )}
              </div>
            </div>

            <Button
              onClick={handleChangePassword}
              disabled={savingPassword || !passwordForm.newPassword || Boolean(pwMismatch) || passwordForm.newPassword.length < 8}
              size="sm"
              className="h-9 px-6 rounded-xl font-bold text-xs gap-1.5"
            >
              <FontAwesomeIcon icon={passwordSaved ? faCheckCircle : faLock} className="h-3 w-3" />
              {savingPassword ? 'Updating...' : passwordSaved ? 'Password Updated!' : 'Change Password'}
            </Button>
          </div>
        </div>

        {/* ── Preferences Card ─────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <FontAwesomeIcon icon={faDesktop} className="h-3 w-3" />
              Navigation Preferences
            </h2>
            {prefSaved && (
              <Badge variant="success" className="gap-1 animate-in fade-in">
                <FontAwesomeIcon icon={faCheckCircle} className="h-2.5 w-2.5" /> Saved
              </Badge>
            )}
          </div>

          <div className="p-6 space-y-4">
            <p className="text-xs text-slate-500 leading-relaxed">
              Set the default module view you want to open immediately after signing in.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Default View on Login</label>
              <select
                className="flex h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                value={defaultPage}
                onChange={e => setDefaultPage(e.target.value)}
              >
                {getPageOptions().map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </div>

            <Button
              onClick={handleSavePref}
              disabled={savingPref}
              size="sm"
              className="h-9 px-6 rounded-xl font-bold text-xs gap-1.5"
            >
              <FontAwesomeIcon icon={prefSaved ? faCheckCircle : faSave} className="h-3 w-3" />
              {savingPref ? 'Saving...' : prefSaved ? 'Saved!' : 'Save Preferences'}
            </Button>
          </div>
        </div>

        {/* ── Notifications Card ─────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <FontAwesomeIcon icon={faBell} className="h-3 w-3" />
              Push Notifications
            </h2>
          </div>

          <div className="p-6 space-y-4">
            <p className="text-xs text-slate-500 leading-relaxed">
              Receive real-time push alerts for cleared payments, lease status updates, and maintenance tickets.
            </p>

            <Button
              onClick={() => promptForPush()}
              size="sm"
              variant="outline"
              className="h-9 px-6 rounded-xl font-bold text-xs gap-1.5"
            >
              <FontAwesomeIcon icon={faBell} className="h-3 w-3" />
              Enable Push Notifications
            </Button>
          </div>
        </div>

        {/* ── White-Label Customization (Admin Only) ──────────────── */}
        {profile.role === 'admin' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden md:col-span-2">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <FontAwesomeIcon icon={faDesktop} className="h-3 w-3 text-amber-500" />
                Custom Brand Styling
              </h2>
            </div>
            <div className="p-6 space-y-5">
              <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
                Configure your custom platform identity, brand logo, and primary theme colors across your instance.
              </p>
              
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Platform Brand Name</label>
                  <Input 
                    className="h-10" 
                    value={platformName} 
                    onChange={e => setPlatformName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Primary Color (Hex)</label>
                  <div className="flex gap-2 items-center">
                    <Input 
                      type="color"
                      className="h-10 w-12 rounded-xl p-1 cursor-pointer border-slate-200 dark:border-slate-700" 
                      value={brandingForm.brandPrimaryColor || '#4F46E5'}
                      onChange={e => setBrandingForm(prev => ({ ...prev, brandPrimaryColor: e.target.value }))}
                    />
                    <Input 
                      className="h-10 flex-1 font-mono text-xs" 
                      placeholder="#4F46E5" 
                      value={brandingForm.brandPrimaryColor}
                      onChange={e => setBrandingForm(prev => ({ ...prev, brandPrimaryColor: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Secondary Color (Hex)</label>
                  <div className="flex gap-2 items-center">
                    <Input 
                      type="color"
                      className="h-10 w-12 rounded-xl p-1 cursor-pointer border-slate-200 dark:border-slate-700" 
                      value={brandingForm.brandSecondaryColor || '#10B981'}
                      onChange={e => setBrandingForm(prev => ({ ...prev, brandSecondaryColor: e.target.value }))}
                    />
                    <Input 
                      className="h-10 flex-1 font-mono text-xs" 
                      placeholder="#10B981" 
                      value={brandingForm.brandSecondaryColor}
                      onChange={e => setBrandingForm(prev => ({ ...prev, brandSecondaryColor: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Custom Brand Logo</label>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden relative">
                      {brandingForm.brandLogoUrl ? (
                        <img src={brandingForm.brandLogoUrl} alt="Logo preview" className="h-full w-full object-contain p-1" />
                      ) : (
                        <FontAwesomeIcon icon={faCamera} className="text-slate-300 h-3.5 w-3.5" />
                      )}
                      {savingBranding && (
                        <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
                          <div className="h-3 w-3 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <label className="cursor-pointer">
                        <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={savingBranding} />
                        <div className="h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                          Upload Asset Image
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <Button 
                  onClick={handleSaveBranding}
                  disabled={savingBranding}
                  size="sm"
                  className="h-9 px-6 rounded-xl font-bold text-xs gap-1.5"
                >
                  <FontAwesomeIcon icon={faSave} className="h-3 w-3" />
                  {savingBranding ? 'Saving...' : 'Save Brand Settings'}
                </Button>
                <p className="mt-2 text-[10px] text-slate-400">Refresh the browser after saving to reload brand styles globally.</p>
              </div>
            </div>
          </div>
        )}

        {/* Spacer for mobile bottom nav */}
        <div className="h-8 md:col-span-2" />
      </div>
    </div>
  );
}
