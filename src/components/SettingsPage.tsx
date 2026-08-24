import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { authClient } from '../lib/auth-client';
import { initPlatform, updatePlatformBranding, getPlatformBranding, updateMyProfile } from '../lib/api';
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
      const ext = file.name.split('.').pop();
      const fileName = `${profile.uid}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('properties').upload(fileName, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('properties').getPublicUrl(fileName);
      setProfileForm(prev => ({ ...prev, avatarUrl: publicUrl }));
      await updateMyProfile({ avatarUrl: publicUrl });
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
      const ext = file.name.split('.').pop();
      const fileName = `${profile.uid}/platforms/${profile.platformId}/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('properties').upload(fileName, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('properties').getPublicUrl(fileName);
      setBrandingForm(prev => ({ ...prev, brandLogoUrl: publicUrl }));
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
    <div className="db pb-24 sm:pb-8 animate-in fade-in duration-700">
      {/* Hero */}
      <div className="hero">
        <div className="hero-meta">
          <span className="lvl-badge">Account</span>
          <div className="status-dot">
            <span className="status-pulse" />
            Secure session
          </div>
        </div>
        <div className="hero-row">
          <div>
            <h1 className="hero-title">Settings</h1>
            <p className="hero-sub">Manage your profile, contact info, and account security.</p>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 mt-6 w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* ── Profile Card ──────────────────────────────────── */}
        <div className="bg-white rounded-3xl border border-zinc-100 shadow-[0_2px_16px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-50 flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400 flex items-center gap-2">
              <FontAwesomeIcon icon={faUser} className="h-3 w-3" />
              Profile Information
            </h2>
            {profileSaved && (
              <Badge className="bg-emerald-100 text-emerald-600 border-none text-[9px] font-black uppercase tracking-widest gap-1 animate-in fade-in">
                <FontAwesomeIcon icon={faCheckCircle} className="h-2.5 w-2.5" /> Saved
              </Badge>
            )}
          </div>

          <div className="p-6 space-y-6">
            {/* Avatar row */}
            <div className="flex items-center gap-5">
              <div className="relative h-20 w-20 rounded-2xl overflow-hidden bg-zinc-100 border-2 border-white shadow-lg shrink-0 group cursor-pointer">
                <img
                  src={profileForm.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.uid}`}
                  alt="Profile"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white opacity-0 group-hover:opacity-100 cursor-pointer transition-all gap-1">
                  <FontAwesomeIcon icon={faCamera} className="h-4 w-4" />
                  <span className="text-[8px] font-black uppercase tracking-widest">Change</span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={isUploading} />
                </label>
              </div>
              <div className="space-y-1">
                <p className="font-black text-sm text-zinc-900">{profileForm.displayName || 'No name set'}</p>
                <p className="text-xs text-zinc-400 font-medium">{profile.email}</p>
                <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${
                  profile.isSuperAdmin ? 'bg-rose-50 text-rose-600' : 'bg-zinc-100 text-zinc-500'
                }`}>
                  <FontAwesomeIcon icon={faShieldAlt} className="h-2 w-2" />
                  {profile.isSuperAdmin ? 'Super Admin' : profile.role}
                </div>
                {isUploading && (
                  <p className="text-[9px] font-black uppercase tracking-widest text-blue-500 animate-pulse">Uploading…</p>
                )}
              </div>
            </div>

            {/* Fields */}
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Display Name</label>
                <Input
                  className="h-11 rounded-xl"
                  value={profileForm.displayName}
                  onChange={e => setProfileForm(prev => ({ ...prev, displayName: e.target.value }))}
                  placeholder="Your full name"
                />
              </div>

              <div className="grid gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faEnvelope} className="h-2.5 w-2.5" /> Email
                </label>
                <Input
                  className="h-11 rounded-xl bg-zinc-50 text-zinc-400 cursor-not-allowed"
                  value={profile.email}
                  disabled
                />
                <p className="text-[9px] font-bold text-zinc-300 uppercase tracking-widest">Email cannot be changed here</p>
              </div>

              <div className="grid gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faPhone} className="h-2.5 w-2.5" /> Phone
                </label>
                <Input
                  className="h-11 rounded-xl"
                  value={profileForm.phone}
                  onChange={e => setProfileForm(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+254 7XX XXX XXX"
                />
              </div>

              <div className="grid gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faMapMarkerAlt} className="h-2.5 w-2.5" /> Address
                </label>
                <Textarea
                  className="rounded-xl resize-none"
                  rows={2}
                  value={profileForm.address}
                  onChange={e => setProfileForm(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="Your address…"
                />
              </div>
            </div>

            <Button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="h-11 px-8 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-black gap-2 transition-all active:scale-[0.98]"
            >
              <FontAwesomeIcon icon={profileSaved ? faCheckCircle : faSave} className="h-3.5 w-3.5" />
              {savingProfile ? 'Saving…' : profileSaved ? 'Saved!' : 'Save Profile'}
            </Button>
          </div>
        </div>

        {/* ── Security Card ─────────────────────────────────── */}
        <div className="bg-white rounded-3xl border border-zinc-100 shadow-[0_2px_16px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-50 flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400 flex items-center gap-2">
              <FontAwesomeIcon icon={faLock} className="h-3 w-3" />
              Security — Change Password
            </h2>
            {passwordSaved && (
              <Badge className="bg-emerald-100 text-emerald-600 border-none text-[9px] font-black uppercase tracking-widest gap-1 animate-in fade-in">
                <FontAwesomeIcon icon={faCheckCircle} className="h-2.5 w-2.5" /> Updated
              </Badge>
            )}
          </div>

          <div className="p-6 space-y-5">
            <p className="text-xs font-medium text-zinc-500 leading-relaxed">
              Choose a strong password at least 8 characters long. You will remain signed in after changing it.
            </p>

            <div className="grid gap-4">
              {/* Current password */}
              <div className="grid gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Current Password</label>
                <div className="relative">
                  <Input
                    type={showOldPw ? 'text' : 'password'}
                    className="h-11 rounded-xl pr-11"
                    value={passwordForm.oldPassword}
                    onChange={e => setPasswordForm(prev => ({ ...prev, oldPassword: e.target.value }))}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 transition-colors p-1"
                  >
                    <FontAwesomeIcon icon={showOldPw ? faEyeSlash : faEye} className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* New password */}
              <div className="grid gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">New Password</label>
                <div className="relative">
                  <Input
                    type={showNewPw ? 'text' : 'password'}
                    className="h-11 rounded-xl pr-11"
                    value={passwordForm.newPassword}
                    onChange={e => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 transition-colors p-1"
                  >
                    <FontAwesomeIcon icon={showNewPw ? faEyeSlash : faEye} className="h-4 w-4" />
                  </button>
                </div>
                {passwordForm.newPassword && passwordForm.newPassword.length < 8 && (
                  <p className="text-[9px] font-black uppercase tracking-widest text-amber-500">Minimum 8 characters</p>
                )}
              </div>

              {/* Confirm password */}
              <div className="grid gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Confirm Password</label>
                <div className="relative">
                  <Input
                    type={showConfirmPw ? 'text' : 'password'}
                    className={`h-11 rounded-xl pr-11 transition-all ${
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 transition-colors p-1"
                  >
                    <FontAwesomeIcon icon={showConfirmPw ? faEyeSlash : faEye} className="h-4 w-4" />
                  </button>
                </div>
                {pwMismatch && (
                  <p className="text-[9px] font-black uppercase tracking-widest text-rose-500">Passwords do not match</p>
                )}
                {pwMatch && (
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500">
                    <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Passwords match
                  </p>
                )}
              </div>
            </div>

            <Button
              onClick={handleChangePassword}
              disabled={savingPassword || !passwordForm.newPassword || Boolean(pwMismatch) || passwordForm.newPassword.length < 8}
              className="h-11 px-8 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-black gap-2 disabled:opacity-40 transition-all active:scale-[0.98]"
            >
              <FontAwesomeIcon icon={passwordSaved ? faCheckCircle : faLock} className="h-3.5 w-3.5" />
              {savingPassword ? 'Updating…' : passwordSaved ? 'Password Updated!' : 'Change Password'}
            </Button>
          </div>
        </div>

        {/* ── Preferences Card ─────────────────────────────────── */}
        <div className="bg-white rounded-3xl border border-zinc-100 shadow-[0_2px_16px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-50 flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400 flex items-center gap-2">
              <FontAwesomeIcon icon={faDesktop} className="h-3 w-3" />
              Preferences
            </h2>
            {prefSaved && (
              <Badge className="bg-emerald-100 text-emerald-600 border-none text-[9px] font-black uppercase tracking-widest gap-1 animate-in fade-in">
                <FontAwesomeIcon icon={faCheckCircle} className="h-2.5 w-2.5" /> Saved
              </Badge>
            )}
          </div>

          <div className="p-6 space-y-5">
            <p className="text-xs font-medium text-zinc-500 leading-relaxed">
              Customize your experience. Set the default page you want to see immediately after logging in.
            </p>

            <div className="grid gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Default Page on Open</label>
              <select
                className="flex h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="h-11 px-8 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-black gap-2 transition-all active:scale-[0.98]"
            >
              <FontAwesomeIcon icon={prefSaved ? faCheckCircle : faSave} className="h-3.5 w-3.5" />
              {savingPref ? 'Saving…' : prefSaved ? 'Saved!' : 'Save Preferences'}
            </Button>
          </div>
        </div>

        {/* ── Notifications Card ─────────────────────────────────── */}
        <div className="bg-white rounded-3xl border border-zinc-100 shadow-[0_2px_16px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-50 flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400 flex items-center gap-2">
              <FontAwesomeIcon icon={faBell} className="h-3 w-3" />
              Notifications
            </h2>
          </div>

          <div className="p-6 space-y-5">
            <p className="text-xs font-medium text-zinc-500 leading-relaxed">
              Never miss an update. Allow push notifications to get instantly notified about payments, messages, and important events.
            </p>

            <Button
              onClick={() => promptForPush()}
              className="h-11 px-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black gap-2 transition-all active:scale-[0.98] w-full sm:w-auto"
            >
              <FontAwesomeIcon icon={faBell} className="h-3.5 w-3.5" />
              Manage Push Notifications
            </Button>
          </div>
        </div>

        {/* ── White-Label Customization (Admin Only) ──────────────── */}
        {profile.role === 'admin' && (
          <div className="bg-white rounded-3xl border border-zinc-100 shadow-[0_2px_16px_rgba(0,0,0,0.04)] overflow-hidden lg:col-span-2">
            <div className="px-6 py-4 border-b border-zinc-50 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400 flex items-center gap-2">
                <FontAwesomeIcon icon={faDesktop} className="h-3 w-3 text-amber-500" />
                Custom Branding (Pro Plus)
              </h2>
            </div>
            <div className="p-6 space-y-5">
              <p className="text-xs font-medium text-zinc-500 leading-relaxed max-w-2xl">
                As a Pro Plus admin, you can fully customize the appearance of the application. Add your own logos, set custom primary colors, and customize the domain name to rent out this app as your own SaaS.
              </p>
              
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Platform Name</label>
                  <Input 
                    className="h-11 rounded-xl" 
                    value={platformName} 
                    onChange={e => setPlatformName(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Primary Color (Hex)</label>
                  <div className="flex gap-2 items-center">
                    <Input 
                      type="color"
                      className="h-11 w-14 rounded-xl p-1 cursor-pointer border-zinc-200" 
                      value={brandingForm.brandPrimaryColor || '#4F46E5'}
                      onChange={e => setBrandingForm(prev => ({ ...prev, brandPrimaryColor: e.target.value }))}
                    />
                    <Input 
                      className="h-11 rounded-xl flex-1 font-mono text-xs" 
                      placeholder="#4F46E5" 
                      value={brandingForm.brandPrimaryColor}
                      onChange={e => setBrandingForm(prev => ({ ...prev, brandPrimaryColor: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Secondary Color (Hex)</label>
                  <div className="flex gap-2 items-center">
                    <Input 
                      type="color"
                      className="h-11 w-14 rounded-xl p-1 cursor-pointer border-zinc-200" 
                      value={brandingForm.brandSecondaryColor || '#10B981'}
                      onChange={e => setBrandingForm(prev => ({ ...prev, brandSecondaryColor: e.target.value }))}
                    />
                    <Input 
                      className="h-11 rounded-xl flex-1 font-mono text-xs" 
                      placeholder="#10B981" 
                      value={brandingForm.brandSecondaryColor}
                      onChange={e => setBrandingForm(prev => ({ ...prev, brandSecondaryColor: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Custom Logo</label>
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl border border-zinc-200 bg-zinc-50 flex items-center justify-center shrink-0 overflow-hidden relative">
                      {brandingForm.brandLogoUrl ? (
                        <img src={brandingForm.brandLogoUrl} alt="Logo preview" className="h-full w-full object-contain p-1" />
                      ) : (
                        <FontAwesomeIcon icon={faCamera} className="text-zinc-300" />
                      )}
                      {savingBranding && (
                        <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
                          <div className="h-4 w-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <label className="cursor-pointer">
                        <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={savingBranding} />
                        <div className="h-11 px-4 rounded-xl border border-zinc-200 flex items-center justify-center text-xs font-bold text-zinc-600 hover:bg-zinc-50 transition-colors">
                          Upload Image
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
                  className="h-11 px-8 rounded-xl bg-amber-400 hover:bg-amber-500 text-zinc-900 font-black gap-2 transition-all active:scale-[0.98]"
                >
                  <FontAwesomeIcon icon={faSave} className="h-3.5 w-3.5" />
                  {savingBranding ? 'Saving...' : 'Save Branding Options'}
                </Button>
                <p className="mt-2 text-[9px] font-black uppercase tracking-widest text-zinc-400">Once saved, refresh the app to see your custom colors and logo take effect globally.</p>
              </div>
            </div>
          </div>
        )}

        {/* Spacer for mobile bottom nav */}
        <div className="h-8 lg:col-span-2" />
      </div>
    </div>
  );
}
