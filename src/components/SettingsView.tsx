import React, { useEffect, useState } from 'react';
import { settingsApi } from '../settingsApi';
import { backupsApi, formatAge, formatBytes, type BackupStatusWire } from '../backupsApi';
import { syncApi, staleness, type SyncStatus } from '../syncApi';
import { InfoHint } from './InfoHint';
import { UserPermissionsModal } from './UserPermissionsModal';
import { receiptsApi } from '../receiptsApi';
import { exportApi } from '../exportApi';
import {
  Users,
  ShieldCheck,
  Key,
  Printer,
  SlidersHorizontal,
  Palette,
  Database,
  Store,
  Check,
  Plus,
  Edit2,
  UserPlus,
  Eye,
  EyeOff,
  Save,
  RotateCcw,
  Download,
  CheckCircle2,
  AlertCircle,
  Building,
  Phone,
  Mail,
  FileText,
  Lock,
  Search,
  X,
  Shield,
  HelpCircle,
  KeyRound,
  PlayCircle,
  Copy,
  Sparkles,
  Clock,
  CloudUpload,
  HardDrive,
  RefreshCw,
  Type,
} from 'lucide-react';
import {
  Outlet,
  OutletId,
  UserAccount,
  UserRole,
  RolePermissions,
  GeneralSettings,
  AuditLogEntry,
  Product,
  CompletedSale,
} from '../types';
import {
  PERMISSION_CATALOGUE,
  PERMISSION_GROUPS,
  ROLE_LABELS,
  ROLE_ORDER,
  type PermissionCode,
  type PermissionSet,
} from '../permissions';
import { exportToCsv } from '../utils/csvExport';
import { ACCENT_PRESETS, DEFAULT_ACCENT, isBlue } from '../accent';
import { FONT_CHOICES } from '../typography';

interface SettingsViewProps {
  currentOutlet: Outlet;
  outlets: Outlet[];
  onAddOutlet: (outlet: Outlet) => void;
  onUpdateOutlet: (outletId: OutletId, changes: Partial<Outlet>) => void;
  currentUser: UserAccount;
  users: UserAccount[];
  /**
   * FR-USER-01: saved by the server. The whole list goes back and the change
   * is found by comparing it with what was held — so this resolves only once
   * the server has accepted it, and rejects when it has not.
   */
  onUpdateUsers: (users: UserAccount[]) => Promise<void>;
  /**
   * FR-USER-03 · BR-16: set, clear or withhold one permission for one person.
   *
   * <p>Its own call rather than part of the bulk user save: an override is a
   * single decision the server records and audits on its own, and folding it
   * into "save this user" would rewrite every other field to change one box.
   */
  onSetUserPermission: (userId: string, code: PermissionCode, granted?: boolean) => Promise<void>;
  /**
   * FR-USER-01: create one account.
   *
   * <p>Separate from {@link onUpdateUsers} because a create should not depend
   * on something noticing a new row in a list it was handed. Rejects when the
   * server refuses, so this screen never claims a save that did not happen.
   */
  onCreateUser: (account: UserAccount) => Promise<UserAccount>;
  rolesPermissions: RolePermissions[];
  onUpdateRolesPermissions: (roles: RolePermissions[]) => void;
  generalSettings: GeneralSettings;
  onUpdateGeneralSettings: (settings: GeneralSettings) => void;
  onUpdateAppearance: (
    settings: Pick<GeneralSettings, 'accentColor' | 'fontFamily' | 'fontScalePercent'>,
  ) => void;
  onAddAuditLog: (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => void;
  products: Product[];
  sales: CompletedSale[];
  accentColor: string;
  onChangeAccent: (color: string) => void;
  permissions: PermissionSet;
}

type SettingsTab =
  | 'general'
  | 'outlets'
  | 'users'
  | 'permissions'
  | 'security'
  | 'thresholds'
  | 'printers'
  | 'appearance'
  | 'backup'
  | 'sync';

const formatSyncInterval = (minutes: number) => {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  return hours === 1 ? '1 hour' : `${hours} hours`;
};

const SETTINGS_TABS: {
  key: SettingsTab;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  /** The permission that opens this section. L-09: without it the tab is absent. */
  requires: PermissionCode;
}[] = [
  { key: 'general', label: 'Store Profile', hint: 'Legal identity, TIN, currency & rounding', icon: Building, requires: 'settings.general' },
  { key: 'outlets', label: 'Stores & Branches', hint: 'Register branches & assign staff', icon: Store, requires: 'settings.general' },
  { key: 'users', label: 'User Accounts', hint: 'Staff credentials & branches', icon: Users, requires: 'user.manage' },
  { key: 'permissions', label: 'Roles & Permissions', hint: 'RBAC matrix & capabilities', icon: ShieldCheck, requires: 'user.manage' },
  { key: 'security', label: 'Manager PIN', hint: 'Floor price & void override policies', icon: Key, requires: 'settings.general' },
  { key: 'thresholds', label: 'Thresholds', hint: 'Idle lock, approval & variance limits', icon: SlidersHorizontal, requires: 'settings.general' },
  { key: 'printers', label: 'Hardware & Receipts', hint: '80mm / 58mm thermal templates', icon: Printer, requires: 'settings.terminal' },
  { key: 'appearance', label: 'Theme', hint: 'Accent colour & visual palette', icon: Palette, requires: 'settings.appearance' },
  { key: 'backup', label: 'Backup', hint: 'Backup status, restores & accounting exports', icon: Database, requires: 'settings.general' },
  // sync.push, not settings.general: closing up should not require the rights to
  // rename the business. Whoever holds only this code sees this tab and no other,
  // and inside it only the one-way "send" action.
  { key: 'sync', label: 'Cloud Sync', hint: 'Control automatic cloud uploads and sync data now', icon: CloudUpload, requires: 'sync.push' },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentOutlet,
  outlets,
  onAddOutlet,
  onUpdateOutlet,
  currentUser,
  users,
  onUpdateUsers,
  onSetUserPermission,
  onCreateUser,
  rolesPermissions,
  onUpdateRolesPermissions,
  generalSettings,
  onUpdateGeneralSettings,
  onUpdateAppearance,
  onAddAuditLog,
  products,
  sales,
  accentColor,
  onChangeAccent,
  permissions,
}) => {
  // Only the sections this user may open exist at all (L-09).
  const visibleTabs = SETTINGS_TABS.filter((item) => permissions.has(item.requires));
  const canManageUsers = permissions.has('user.manage');
  const [thresholdDraft, setThresholdDraft] = useState(generalSettings.thresholds);
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    () => SETTINGS_TABS.find((item) => permissions.has(item.requires))?.key || 'appearance',
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // FR-SET-07 · NFR-6: the server's backups, which are the ones that survive
  // this machine. Loaded when the tab opens rather than on mount — an owner on
  // the theme tab has no use for it, and it shells out to pg_dump history.
  const [backupStatus, setBackupStatus] = useState<BackupStatusWire | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);

  // The two R2 channels. Loaded when the tab opens rather than on mount — a
  // shop on the theme tab has no use for it, and status walks every table
  // counting what is unsent.
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncBusy, setSyncBusy] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncOutletId, setSyncOutletId] = useState<string>('');
  const [cloudSyncIntervalMinutes, setCloudSyncIntervalMinutes] = useState(
    generalSettings.cloudSyncIntervalMinutes,
  );

  useEffect(() => {
    setCloudSyncIntervalMinutes(generalSettings.cloudSyncIntervalMinutes);
  }, [generalSettings.cloudSyncIntervalMinutes]);

  // General Store Settings State
  const [companyName, setCompanyName] = useState(generalSettings.companyName);
  const [taxRegNo, setTaxRegNo] = useState(generalSettings.taxRegistrationNumber);
  const [taxEnabled, setTaxEnabled] = useState(generalSettings.taxEnabled);
  const [taxRate, setTaxRate] = useState(generalSettings.taxRatePercent);
  const [currencySymbol, setCurrencySymbol] = useState(generalSettings.currencySymbol);
  const [cashRounding, setCashRounding] = useState(generalSettings.cashRounding);

  // Security & PIN State.
  //
  // FR-USER-01: the PIN here is the signed-in user's own, not a shared master
  // code. A single number everybody knows makes every approval it authorises
  // anonymous, which is the one thing an approval exists not to be.
  const [ownPin, setOwnPin] = useState('');
  const [pinPassword, setPinPassword] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [enforceFloorPin, setEnforceFloorPin] = useState(generalSettings.enforceFloorPricePin);
  const [enforceVoidPin, setEnforceVoidPin] = useState(generalSettings.enforceVoidPin);
  const [enforceBlindShift, setEnforceBlindShift] = useState(generalSettings.enforceBlindShiftCount);

  // Hardware & Receipts State
  const [printerWidth, setPrinterWidth] = useState<'80mm' | '58mm'>(generalSettings.receiptPrinterWidth);
  const [receiptHeader, setReceiptHeader] = useState(generalSettings.receiptHeaderMessage);
  const [receiptFooter, setReceiptFooter] = useState(generalSettings.receiptFooterPolicy);
  const [autoPrint, setAutoPrint] = useState(generalSettings.autoPrintReceipt);
  const [showCashier, setShowCashier] = useState(generalSettings.showCashierOnReceipt);

  // Stores & Branches State
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Outlet | null>(null);
  const [branchName, setBranchName] = useState('');
  const [branchTown, setBranchTown] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchPhone, setBranchPhone] = useState('');
  const [branchPrefix, setBranchPrefix] = useState('');
  const [branchManager, setBranchManager] = useState('');
  const [branchStaffIds, setBranchStaffIds] = useState<string[]>([]);
  const [assignBranch, setAssignBranch] = useState<Outlet | null>(null);
  const [assignSearch, setAssignSearch] = useState('');

  // User Management State
  const [userSearch, setUserSearch] = useState('');
  const [userOutletFilter, setUserOutletFilter] = useState<string>('all');
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [userFullName, setUserFullName] = useState('');
  const [userUsername, setUserUsername] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userRole, setUserRole] = useState<UserRole | ''>('');
  const [userOutlet, setUserOutlet] = useState<OutletId | ''>('');
  const [userPin, setUserPin] = useState('');
  const [userMustChangePassword, setUserMustChangePassword] = useState(false);
  /**
   * FR-AUTH-07: the password a new account is created with.
   *
   * <p>Required, because an account with no password cannot be signed into and
   * there is no other way in. The server marks the account as needing its
   * owner to replace this one before it can be used for anything.
   */
  const [userPassword, setUserPassword] = useState('');
  const [userSaving, setUserSaving] = useState(false);

  // Password Reset Workflow State
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
  const [targetUserForPasswordReset, setTargetUserForPasswordReset] = useState<UserAccount | null>(null);
  const [tempPasswordInput, setTempPasswordInput] = useState('');
  const [showTempPassword, setShowTempPassword] = useState(true);
  const [mustChangeOnNextLogin, setMustChangeOnNextLogin] = useState(true);
  const [dispatchNotification, setDispatchNotification] = useState(true);
  const [copiedTempPassword, setCopiedTempPassword] = useState(false);

  // Interactive Next-Login Password Update Simulation Prompt
  const [isNextLoginPromptOpen, setIsNextLoginPromptOpen] = useState(false);
  const [simulatedUserForLoginPrompt, setSimulatedUserForLoginPrompt] = useState<UserAccount | null>(null);
  const [simCurrentPass, setSimCurrentPass] = useState('');
  const [simNewPass, setSimNewPass] = useState('');
  const [simConfirmPass, setSimConfirmPass] = useState('');
  const [simShowPass, setSimShowPass] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  // Role Permissions Matrix State
  const [selectedRoleForEdit, setSelectedRoleForEdit] = useState<UserRole>('cashier');
  const [editableRoles, setEditableRoles] = useState<RolePermissions[]>(rolesPermissions);

  // Custom Appearance Hex Input State
  const [customHex, setCustomHex] = useState(accentColor);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Handle saving general settings
  const handleSaveGeneral = () => {
    const updated: GeneralSettings = {
      ...generalSettings,
      companyName,
      taxRegistrationNumber: taxRegNo,
      taxEnabled,
      taxRatePercent: Number(taxRate),
      currencySymbol,
      cashRounding,
    };
    onUpdateGeneralSettings(updated);
    onAddAuditLog({
      actor: 'Admin',
      action: 'UPDATE_GENERAL_SETTINGS',
      entity: 'System Config',
      outletName: currentOutlet.name,
      details: `Updated company profile, tax (${taxEnabled ? `${taxRate}%` : 'Disabled'}), and rounding to ${cashRounding}`,
    });
    showToast('General store settings saved successfully.');
  };

  /**
   * FR-AUTH-02: set your own approval PIN.
   *
   * Separate from saving the policies below, because they are different acts:
   * one changes a credential that belongs to this person, the other changes a
   * rule that applies to everybody.
   */
  const handleSetOwnPin = async () => {
    if (!/^\d{4,6}$/.test(ownPin)) {
      alert('A PIN is 4 to 6 digits.');
      return;
    }
    if (!pinPassword) {
      alert('Enter your password to confirm it is you.');
      return;
    }
    setPinSaving(true);
    try {
      await settingsApi.setOwnPin(pinPassword, ownPin);
      setOwnPin('');
      setPinPassword('');
      onAddAuditLog({
        actor: currentUser.fullName,
        action: 'UPDATE_APPROVAL_PIN',
        entity: 'Security & PIN',
        outletName: currentOutlet.name,
        details: 'Set their own approval PIN',
      });
      showToast('Your approval PIN is set.');
    } catch (failure) {
      alert(failure instanceof Error ? failure.message : 'That PIN could not be set.');
    } finally {
      setPinSaving(false);
    }
  };

  // Handle saving security settings
  const handleSaveSecurity = () => {
    const updated: GeneralSettings = {
      ...generalSettings,
      enforceFloorPricePin: enforceFloorPin,
      enforceVoidPin: enforceVoidPin,
      enforceBlindShiftCount: enforceBlindShift,
    };
    onUpdateGeneralSettings(updated);
    onAddAuditLog({
      actor: 'Admin',
      action: 'UPDATE_SECURITY_POLICIES',
      entity: 'Security & PIN',
      outletName: currentOutlet.name,
      details: `Updated security policies (Floor approval: ${enforceFloorPin}, Void approval: ${enforceVoidPin}, Blind shift count: ${enforceBlindShift})`,
    });
    showToast('Security policies updated successfully.');
  };

  // Handle saving printer & receipt settings
  const handleSavePrinters = () => {
    const updated: GeneralSettings = {
      ...generalSettings,
      receiptPrinterWidth: printerWidth,
      receiptHeaderMessage: receiptHeader,
      receiptFooterPolicy: receiptFooter,
      autoPrintReceipt: autoPrint,
      showCashierOnReceipt: showCashier,
    };
    onUpdateGeneralSettings(updated);
    onAddAuditLog({
      actor: 'Admin',
      action: 'UPDATE_PRINTER_SETTINGS',
      entity: 'Hardware Config',
      outletName: currentOutlet.name,
      details: `Updated receipt format to ${printerWidth}, auto-print: ${autoPrint}, cashier tag: ${showCashier}`,
    });
    showToast('Printer & thermal receipt template saved successfully.');
  };

  // ==========================================
  // STORES & BRANCHES
  // ==========================================
  const slugifyBranch = (name: string) => {
    const base = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'branch';
    if (base === 'all-outlets') return `${base}-store`;

    let candidate = base;
    let suffix = 2;
    while (outlets.some((o) => o.id === candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  };

  /**
   * Derive a receipt prefix like "RAD" from the branch name when left blank.
   *
   * BR-6 numbers receipts `{OUTLET}-{TERMINAL}-{SEQ}` — `INC-01-004312`. The
   * prefix is the OUTLET segment alone, so it must not contain a hyphen: a
   * prefix of "RAD-01" yields "RAD-01-01-004312", with the terminal twice and
   * a number that no longer splits into three. Same-stem branches are
   * separated with a trailing digit rather than a "-NN" suffix.
   */
  const suggestReceiptPrefix = (name: string) => {
    const letters = name.replace(/[^a-zA-Z]/g, '').toUpperCase();
    const stem = (letters.slice(0, 3) || 'BRN').padEnd(3, 'X');
    const taken = (value: string) =>
      outlets.some((o) => o.receiptPrefix.toUpperCase() === value && o.id !== editingBranch?.id);

    if (!taken(stem)) return stem;
    let index = 2;
    while (taken(`${stem}${index}`)) index += 1;
    return `${stem}${index}`;
  };

  const staffCountForBranch = (outletId: OutletId) =>
    users.filter((u) => u.outletId === outletId).length;

  const handleOpenNewBranchModal = () => {
    setEditingBranch(null);
    setBranchName('');
    setBranchTown('');
    setBranchAddress('');
    setBranchPhone('');
    setBranchPrefix('');
    setBranchManager('');
    setBranchStaffIds([]);
    setIsBranchModalOpen(true);
  };

  const handleOpenEditBranchModal = (outlet: Outlet) => {
    setEditingBranch(outlet);
    setBranchName(outlet.name);
    setBranchTown(outlet.town);
    setBranchAddress(outlet.address);
    setBranchPhone(outlet.phone);
    setBranchPrefix(outlet.receiptPrefix);
    setBranchManager(outlet.managerName);
    setBranchStaffIds(users.filter((u) => u.outletId === outlet.id).map((u) => u.id));
    setIsBranchModalOpen(true);
  };

  const handleSaveBranch = (e: React.FormEvent) => {
    e.preventDefault();

    if (!branchName.trim() || !branchTown.trim()) {
      alert('Branch name and town are required.');
      return;
    }

    const prefix = (branchPrefix.trim() || suggestReceiptPrefix(branchName)).toUpperCase();

    // BR-6: the prefix is the OUTLET segment of {OUTLET}-{TERMINAL}-{SEQ}. A
    // hyphen here silently produces a four-part receipt number.
    if (!/^[A-Z0-9]{2,6}$/.test(prefix)) {
      alert(
        `Receipt prefix "${prefix}" is not valid. Use 2–6 letters or digits and no hyphen — ` +
          `the terminal and sequence are added automatically, as in ${prefix.replace(/[^A-Z0-9]/g, '') || 'INC'}-01-004312.`
      );
      return;
    }

    const clashesWith = outlets.find(
      (o) => o.receiptPrefix.toUpperCase() === prefix && o.id !== editingBranch?.id
    );
    if (clashesWith) {
      alert(
        `Receipt prefix "${prefix}" is already used by ${clashesWith.name}. Receipt numbers must stay unique per branch.`
      );
      return;
    }

    if (editingBranch) {
      onUpdateOutlet(editingBranch.id, {
        name: branchName.trim(),
        town: branchTown.trim(),
        address: branchAddress.trim(),
        phone: branchPhone.trim(),
        receiptPrefix: prefix,
        managerName: branchManager.trim(),
      });
      applyBranchStaffAssignment(editingBranch.id, branchStaffIds, branchName.trim());
      onAddAuditLog({
        actor: currentUser.fullName,
        action: 'UPDATE_STORE_BRANCH',
        entity: `Branch: ${branchName.trim()}`,
        outletName: currentOutlet.name,
        details: `Updated branch profile (${branchTown.trim()}, prefix ${prefix}) and staff assignment.`,
      });
      showToast(`Branch "${branchName.trim()}" updated successfully.`);
    } else {
      const newOutlet: Outlet = {
        id: slugifyBranch(branchName),
        name: branchName.trim(),
        town: branchTown.trim(),
        phone: branchPhone.trim() || '+233 00 000 0000',
        address: branchAddress.trim() || branchTown.trim(),
        receiptPrefix: prefix,
        managerName: branchManager.trim() || 'Unassigned',
        active: true,
        createdAt: new Date().toLocaleDateString('en-GB'),
      };
      onAddOutlet(newOutlet);
      applyBranchStaffAssignment(newOutlet.id, branchStaffIds, newOutlet.name);
      onAddAuditLog({
        actor: currentUser.fullName,
        action: 'CREATE_STORE_BRANCH',
        entity: `Branch: ${newOutlet.name}`,
        outletName: currentOutlet.name,
        details: `Registered new branch in ${newOutlet.town} with receipt prefix ${newOutlet.receiptPrefix}. ${branchStaffIds.length} staff assigned.`,
      });
      showToast(`Branch "${newOutlet.name}" created successfully.`);
    }

    setIsBranchModalOpen(false);
  };

  /** Moves the selected staff onto a branch and releases anyone removed from it. */
  const applyBranchStaffAssignment = (
    outletId: OutletId,
    staffIds: string[],
    branchLabel: string
  ) => {
    const updated = users.map((u) => {
      const shouldBeHere = staffIds.includes(u.id);
      if (shouldBeHere && u.outletId !== outletId) return { ...u, outletId };
      // Only release staff that currently sit on this branch and were unticked.
      if (!shouldBeHere && u.outletId === outletId) return { ...u, outletId: 'all-outlets' };
      return u;
    });

    const changed = updated.some((u, i) => u.outletId !== users[i].outletId);
    if (changed) {
      onUpdateUsers(updated);
      onAddAuditLog({
        actor: currentUser.fullName,
        action: 'ASSIGN_STAFF_TO_BRANCH',
        entity: `Branch: ${branchLabel}`,
        outletName: currentOutlet.name,
        details: `Branch staff roster set to ${staffIds.length} member(s). Released staff revert to the HQ (All Outlets) scope.`,
      });
    }
  };

  const handleToggleBranchStaff = (userId: string) => {
    setBranchStaffIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleToggleBranchActive = (outlet: Outlet) => {
    const nextActive = outlet.active === false;
    const staff = staffCountForBranch(outlet.id);
    if (!nextActive && staff > 0) {
      const proceed = window.confirm(
        `${outlet.name} still has ${staff} staff member(s) assigned. Deactivating blocks them from signing in until they are reassigned. Continue?`
      );
      if (!proceed) return;
    }

    onUpdateOutlet(outlet.id, { active: nextActive });
    onAddAuditLog({
      actor: currentUser.fullName,
      action: nextActive ? 'ACTIVATE_STORE_BRANCH' : 'DEACTIVATE_STORE_BRANCH',
      entity: `Branch: ${outlet.name}`,
      outletName: currentOutlet.name,
      details: `${nextActive ? 'Reopened' : 'Deactivated'} branch ${outlet.name} (${outlet.town}).`,
    });
    showToast(`Branch "${outlet.name}" ${nextActive ? 'reactivated' : 'deactivated'}.`);
  };

  /** Reassigns a single staff member directly from the branch roster drawer. */
  const handleSetUserBranch = (userId: string, outletId: OutletId) => {
    const target = users.find((u) => u.id === userId);
    if (!target) return;
    onUpdateUsers(users.map((u) => (u.id === userId ? { ...u, outletId } : u)));
    onAddAuditLog({
      actor: currentUser.fullName,
      action: 'ASSIGN_STAFF_TO_BRANCH',
      entity: `User: ${target.username}`,
      outletName: currentOutlet.name,
      details: `Reassigned ${target.fullName} to ${
        outletId === 'all-outlets'
          ? 'All Outlets (HQ)'
          : outlets.find((o) => o.id === outletId)?.name || outletId
      }.`,
    });
    showToast(`${target.fullName} reassigned successfully.`);
  };

  // User modal handlers
  const handleOpenNewUserModal = () => {
    setEditingUser(null);
    setUserFullName('');
    setUserUsername('');
    setUserEmail('');
    setUserPhone('');
    setUserRole('');
    setUserOutlet('');
    setUserPin('');
    setUserMustChangePassword(false);
    setUserPassword(generateSecureTempPassword());
    setIsUserModalOpen(true);
  };

  const handleOpenEditUserModal = (u: UserAccount) => {
    setEditingUser(u);
    setUserFullName(u.fullName);
    setUserUsername(u.username);
    setUserEmail(u.email);
    setUserPhone(u.phone);
    setUserRole(u.role);
    setUserOutlet(u.outletId);
    setUserPin(u.pinCode || '');
    setUserMustChangePassword(!!u.mustChangePasswordOnNextLogin);
    // Editing never shows or changes a password. Resetting one is its own act,
    // with its own audit entry, on the reset control below.
    setUserPassword('');
    setIsUserModalOpen(true);
  };

  // Generate secure readable temporary password
  const generateSecureTempPassword = () => {
    const prefixes = ['Radiance', 'Apex', 'Inco', 'Kumasi', 'SafeVault', 'VoltSafe', 'Terminal'];
    const symbols = ['#', '!', '$', '@', '&'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}${symbol}${num}`;
  };

  // Open reset password workflow modal
  const handleOpenResetPasswordModal = (u: UserAccount) => {
    setTargetUserForPasswordReset(u);
    const tempPass = generateSecureTempPassword();
    setTempPasswordInput(tempPass);
    setShowTempPassword(true);
    setMustChangeOnNextLogin(true); // Standard security default: force update on next login
    setDispatchNotification(true);
    setCopiedTempPassword(false);
    setIsResetPasswordModalOpen(true);
  };

  // Copy temporary password to clipboard
  const handleCopyTempPassword = () => {
    if (!tempPasswordInput) return;
    navigator.clipboard.writeText(tempPasswordInput).catch(() => {});
    setCopiedTempPassword(true);
    setTimeout(() => setCopiedTempPassword(false), 2200);
    showToast('Temporary password copied to clipboard.');
  };

  // Confirm and persist password reset workflow
  const handleConfirmPasswordReset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!targetUserForPasswordReset) return;

    if (tempPasswordInput.trim().length < 8) {
      alert('Temporary password must contain at least 8 characters.');
      return;
    }

    const timestamp = new Date().toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const updated = users.map((u) => {
      if (u.id === targetUserForPasswordReset.id) {
        return {
          ...u,
          tempPassword: tempPasswordInput.trim(),
          mustChangePasswordOnNextLogin: mustChangeOnNextLogin,
          passwordResetAt: timestamp,
        };
      }
      return u;
    });

    try {
      await onUpdateUsers(updated);
    } catch (failure) {
      alert(failure instanceof Error ? failure.message : 'The password reset could not be saved.');
      return;
    }

    if (editingUser && editingUser.id === targetUserForPasswordReset.id) {
      setEditingUser({
        ...editingUser,
        tempPassword: tempPasswordInput.trim(),
        mustChangePasswordOnNextLogin: mustChangeOnNextLogin,
        passwordResetAt: timestamp,
      });
      setUserMustChangePassword(mustChangeOnNextLogin);
    }

    onAddAuditLog({
      actor: 'Admin',
      action: 'RESET_USER_PASSWORD',
      entity: `User: ${targetUserForPasswordReset.username}`,
      outletName: currentOutlet.name,
      details: `Password reset executed for ${targetUserForPasswordReset.fullName} (@${targetUserForPasswordReset.username}). Force update on next login: ${
        mustChangeOnNextLogin ? 'REQUIRED (Flag Set)' : 'NOT REQUIRED'
      }. ${dispatchNotification ? `Notification dispatched to ${targetUserForPasswordReset.email}` : ''}`,
    });

    showToast(
      `Password successfully reset for "${targetUserForPasswordReset.fullName}". Password update on next login: ${
        mustChangeOnNextLogin ? 'Enforced' : 'Disabled'
      }.`
    );

    setIsResetPasswordModalOpen(false);
  };

  // Direct toggle for the state-based flag
  const handleToggleMustChangePasswordFlag = (userId: string) => {
    const target = users.find((u) => u.id === userId);
    if (!target) return;
    const newFlag = !target.mustChangePasswordOnNextLogin;
    const updated = users.map((u) =>
      u.id === userId ? { ...u, mustChangePasswordOnNextLogin: newFlag } : u
    );
    onUpdateUsers(updated);

    onAddAuditLog({
      actor: 'Admin',
      action: newFlag ? 'FLAG_PASSWORD_RESET_REQUIRED' : 'CLEAR_PASSWORD_RESET_FLAG',
      entity: `User: ${target.username}`,
      outletName: currentOutlet.name,
      details: `${newFlag ? 'Flagged' : 'Cleared'} mandatory password change on next login for ${target.fullName}.`,
    });

    showToast(
      newFlag
        ? `Flag active: "${target.fullName}" must update password on next login.`
        : `Flag cleared: "${target.fullName}" no longer requires password update.`
    );
  };

  // Next-login interactive simulation handlers
  const handleOpenSimulateLoginPrompt = (u: UserAccount) => {
    setSimulatedUserForLoginPrompt(u);
    setSimCurrentPass(u.tempPassword || 'ChangeMe#2026');
    setSimNewPass('');
    setSimConfirmPass('');
    setSimShowPass(false);
    setSimError(null);
    setIsNextLoginPromptOpen(true);
  };

  const handleCompleteNextLoginPasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simulatedUserForLoginPrompt) return;

    if (!simNewPass || simNewPass.length < 8) {
      setSimError('New password must contain at least 8 characters.');
      return;
    }
    if (simNewPass !== simConfirmPass) {
      setSimError('Passwords do not match. Please retype carefully.');
      return;
    }
    if (simCurrentPass && simNewPass === simCurrentPass) {
      setSimError('New password cannot be identical to your temporary password.');
      return;
    }

    const updated = users.map((u) =>
      u.id === simulatedUserForLoginPrompt.id
        ? {
            ...u,
            mustChangePasswordOnNextLogin: false,
            tempPassword: undefined,
          }
        : u
    );
    onUpdateUsers(updated);

    onAddAuditLog({
      actor: simulatedUserForLoginPrompt.fullName,
      action: 'USER_PASSWORD_CHANGE_COMPLETED',
      entity: `User: ${simulatedUserForLoginPrompt.username}`,
      outletName: currentOutlet.name,
      details: `Staff member completed mandatory next-login password update and created new personal credentials.`,
    });

    showToast(
      `Password successfully updated for "${simulatedUserForLoginPrompt.fullName}". Next login requirement cleared.`
    );
    setIsNextLoginPromptOpen(false);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFullName.trim() || !userUsername.trim() || !userRole || !userOutlet) {
      alert('Please fill in required fields (Name, Username, Role, and Store Branch).');
      return;
    }
    if (!/^\d{4}$/.test(userPin)) {
      alert('PIN must be exactly 4 numeric digits.');
      return;
    }
    if (!editingUser && userPassword.trim().length < 8) {
      alert('A new account needs a temporary password of at least 8 characters. They will be asked to change it when they first sign in.');
      return;
    }

    if (editingUser) {
      const updated = users.map((u) =>
        u.id === editingUser.id
          ? {
              ...u,
              fullName: userFullName.trim(),
              username: userUsername.trim().toLowerCase(),
              email: userEmail.trim(),
              phone: userPhone.trim(),
              role: userRole,
              outletId: userOutlet,
              pinCode: userPin,
              mustChangePasswordOnNextLogin: userMustChangePassword,
            }
          : u
      );
      setUserSaving(true);
      try {
        await onUpdateUsers(updated);
      } catch {
        // The reason was already shown; the list has been put back to what the
        // server holds, so the screen is not left claiming a save that failed.
        setUserSaving(false);
        return;
      }
      setUserSaving(false);
      onAddAuditLog({
        actor: 'Admin',
        action: 'UPDATE_USER',
        entity: `User: ${userUsername}`,
        outletName: currentOutlet.name,
        details: `Updated staff profile for ${userFullName} (${userRole}, ${userOutlet}). Require password update on next login: ${
          userMustChangePassword ? 'YES (Enforced)' : 'NO'
        }`,
      });
      showToast(`User "${userFullName}" updated successfully.`);
    } else {
      const newUser: UserAccount = {
        id: `usr-${Date.now()}`,
        fullName: userFullName.trim(),
        username: userUsername.trim().toLowerCase(),
        email: userEmail.trim() || `${userUsername.trim().toLowerCase()}@example.com`,
        phone: userPhone.trim() || '+233 24 000 0000',
        role: userRole,
        outletId: userOutlet,
        active: true,
        pinCode: userPin,
        // Sent once, on creation. It is never read back from the server.
        password: userPassword.trim(),
        lastLogin: 'Never',
        avatarUrl: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80`,
        mustChangePasswordOnNextLogin: userMustChangePassword,
      };
      setUserSaving(true);
      try {
        await onCreateUser(newUser);
      } catch (failure) {
        // Say why, here, on the form that is still open. A silent return left
        // the modal closed and the list unchanged with no explanation.
        alert(failure instanceof Error
          ? failure.message
          : 'That account could not be created.');
        setUserSaving(false);
        return;
      }
      setUserSaving(false);
      onAddAuditLog({
        actor: 'Admin',
        action: 'CREATE_USER',
        entity: `User: ${userUsername}`,
        outletName: currentOutlet.name,
        details: `Created new staff account for ${userFullName} with role ${userRole}. Require password update on next login: ${
          userMustChangePassword ? 'YES (Enforced)' : 'NO'
        }`,
      });
      showToast(`Staff member "${userFullName}" created successfully.`);
    }

    setIsUserModalOpen(false);
  };

  /** FR-USER-03: whose permissions are open, if any. */
  const [permissionsFor, setPermissionsFor] = useState<UserAccount | null>(null);

  /**
   * FR-SET-01: the business logo.
   *
   * <p>`logoUrl` was the only field, so the logo had to already live somewhere
   * on the internet — on a counter whose connection cannot be relied on to make
   * a sale. The bytes now go to the server, which serves them back.
   *
   * <p>`logoVersion` busts the browser cache after an upload: the URL does not
   * change, so without it the old picture stays on screen and the shop thinks
   * the upload failed.
   */
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoVersion, setLogoVersion] = useState(() => Date.now());
  const [hasLogo, setHasLogo] = useState(Boolean(generalSettings.logoUrl));

  const handleLogoChosen = async (file: File | undefined) => {
    if (!file) return;
    setLogoBusy(true);
    setLogoError(null);
    try {
      await settingsApi.uploadLogo(file);
      setHasLogo(true);
      setLogoVersion(Date.now());
      onAddAuditLog({
        actor: 'Admin',
        action: 'SETTINGS_LOGO_CHANGED',
        entity: 'System Config',
        outletName: currentOutlet.name,
        details: `Uploaded a business logo (${Math.round(file.size / 1024)} KB)`,
      });
      showToast('Logo saved.');
    } catch (failure) {
      setLogoError(failure instanceof Error ? failure.message : 'The logo could not be saved.');
    } finally {
      setLogoBusy(false);
    }
  };

  const handleLogoRemoved = async () => {
    setLogoBusy(true);
    setLogoError(null);
    try {
      await settingsApi.removeLogo();
      setHasLogo(false);
      setLogoVersion(Date.now());
      showToast('Logo removed.');
    } catch (failure) {
      setLogoError(failure instanceof Error ? failure.message : 'The logo could not be removed.');
    } finally {
      setLogoBusy(false);
    }
  };

  /** FR-RCPT-09: the slip as the server renders it, at the chosen width. */
  const [receiptPreview, setReceiptPreview] = useState<string[]>([]);
  const [receiptPreviewError, setReceiptPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setReceiptPreviewError(null);
    void receiptsApi.preview(printerWidth === '58mm' ? '58mm' : '80mm')
      .then((receipt) => { if (current) setReceiptPreview(receipt.lines); })
      .catch((failure) => {
        if (!current) return;
        setReceiptPreview([]);
        setReceiptPreviewError(failure instanceof Error
          ? failure.message
          : 'The preview could not be rendered.');
      });
    return () => { current = false; };
  }, [printerWidth]);

  const handleToggleUserActive = (userId: string) => {
    const userToToggle = users.find((u) => u.id === userId);
    if (!userToToggle) return;
    const newStatus = !userToToggle.active;
    const updated = users.map((u) => (u.id === userId ? { ...u, active: newStatus } : u));
    onUpdateUsers(updated);
    onAddAuditLog({
      actor: 'Admin',
      action: newStatus ? 'ACTIVATE_USER' : 'SUSPEND_USER',
      entity: `User: ${userToToggle.username}`,
      outletName: currentOutlet.name,
      details: `${newStatus ? 'Activated' : 'Suspended'} access for ${userToToggle.fullName}`,
    });
    showToast(`User "${userToToggle.fullName}" marked as ${newStatus ? 'Active' : 'Suspended'}.`);
  };

  // Role permissions handlers
  const handleTogglePermission = (roleKey: UserRole, code: PermissionCode) => {
    // BR-16: permission changes cannot be self-applied.
    if (roleKey === currentUser.role) return;
    setEditableRoles((prev) =>
      prev.map((r) => {
        if (r.role !== roleKey) return r;
        const granted = r.permissions.includes(code);
        return {
          ...r,
          permissions: granted
            ? r.permissions.filter((item) => item !== code)
            : [...r.permissions, code],
        };
      })
    );
  };

  const handleSaveRolePermissions = () => {
    onUpdateRolesPermissions(editableRoles);
    onAddAuditLog({
      actor: 'Admin',
      action: 'UPDATE_ROLE_PERMISSIONS',
      entity: `Role: ${selectedRoleForEdit}`,
      outletName: currentOutlet.name,
      details: `Saved permission matrix changes for role "${selectedRoleForEdit}"`,
    });
    showToast('Role permissions matrix saved successfully.');
  };

  const handleSaveThresholds = () => {
    onUpdateGeneralSettings({ ...generalSettings, thresholds: thresholdDraft });
    onAddAuditLog({
      actor: currentUser.fullName,
      action: 'UPDATE_THRESHOLDS',
      entity: 'Operational thresholds',
      outletName: currentOutlet.name,
      details: `Idle lock ${thresholdDraft.idleLockMinutes}m · adjustment approval GH₵ ${thresholdDraft.adjustmentApprovalValue} · variance GH₵ ${thresholdDraft.cashVarianceExplain}`,
    });
    showToast('Operational thresholds saved.');
  };

  const handleSaveCloudSyncInterval = () => {
    onUpdateGeneralSettings({ ...generalSettings, cloudSyncIntervalMinutes });
    showToast(`Automatic Cloud Sync will run every ${formatSyncInterval(cloudSyncIntervalMinutes)}.`);
  };

  const handleResetRolePermissions = () => {
    setEditableRoles(rolesPermissions);
    showToast('Permissions reset to previously saved configuration.');
  };

  // Filtered users
  const filteredUsers = users.filter((u) => {
    const matchSearch =
      u.fullName.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.phone.includes(userSearch);
    const matchOutlet =
      userOutletFilter === 'all' || u.outletId === 'all-outlets' || u.outletId === userOutletFilter;
    return matchSearch && matchOutlet;
  });

  /** What this instance has and has not sent. Re-read after every action. */
  const loadSyncStatus = React.useCallback(async () => {
    try {
      setSyncStatus(await syncApi.status());
      setSyncError(null);
    } catch (failure) {
      setSyncError(failure instanceof Error ? failure.message : 'Could not read the sync status');
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'sync' && permissions.has('sync.push')) void loadSyncStatus();
  }, [activeTab, permissions, loadSyncStatus]);

  /**
   * Runs one channel action and reports what it did.
   *
   * <p>All four share this because the shape is the same every time: press,
   * wait, say what happened in rows and batches rather than "Done". An owner
   * pressing Update wants to know whether anything actually arrived.
   */
  const runSync = async (name: string, action: () => Promise<{ message: string }>) => {
    setSyncBusy(name);
    setSyncError(null);
    setSyncResult(null);
    try {
      const outcome = await action();
      setSyncResult(outcome.message);
      await loadSyncStatus();
    } catch (failure) {
      setSyncError(failure instanceof Error ? failure.message : `${name} failed.`);
    } finally {
      setSyncBusy(null);
    }
  };

  // FR-SET-07: the status the screen asks for on every open. A stale "healthy"
  // is worse than no light at all, so it is re-read rather than cached.
  const loadBackupStatus = React.useCallback(async () => {
    try {
      setBackupStatus(await backupsApi.status(20));
      setBackupError(null);
    } catch (failure) {
      // Shown, not swallowed. "Cannot read the backup status" is itself
      // something an owner needs to know about the backups.
      setBackupError(failure instanceof Error ? failure.message : 'Could not read the backup status');
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'backup' && permissions.has('settings.general')) void loadBackupStatus();
  }, [activeTab, permissions, loadBackupStatus]);

  /**
   * NFR-6: take one now.
   *
   * The reason this button exists is the minute before something risky — a
   * stocktake, a price change across the catalogue — when waiting for the next
   * scheduled run is the wrong answer.
   */
  const handleBackupNow = async () => {
    setBackupBusy(true);
    try {
      const run = await backupsApi.runNow();
      await loadBackupStatus();
      // The server records a failed attempt and returns it rather than throwing,
      // so a 200 is not the same as a backup. The screen says which happened.
      if (run.outcome === 'SUCCEEDED') {
        showToast(
          run.storedOffsite
            ? 'Backup taken and sent off-site.'
            : 'Backup taken on this machine. It has not left the disk.',
        );
      } else {
        showToast(`Backup failed: ${run.error || 'no reason given'}`);
      }
    } catch (failure) {
      showToast(failure instanceof Error ? failure.message : 'Could not take a backup');
    } finally {
      setBackupBusy(false);
    }
  };

  // Export full JSON database
  const [exporting, setExporting] = useState<'JSON' | 'CSV' | null>(null);

  /**
   * FR-SET-08: the shop's data, from the server.
   *
   * <p>This used to build a file out of whatever this browser had loaded and
   * call it a "full backup" — products and sales the screen happened to be
   * holding, which at a hundred receipts is right and at a hundred and one is
   * quietly incomplete. The contract term is all business data, and only the
   * server can honour it.
   */
  const handleExportBusinessData = async (format: 'JSON' | 'CSV') => {
    setExporting(format);
    try {
      await exportApi.download(format);
      // FR-AUDIT-02: the server records it too, against the account that asked.
      // This is the local copy the audit screen shows without a round trip.
      onAddAuditLog({
        actor: 'Admin',
        action: 'DATA_EXPORTED',
        entity: 'System Data',
        outletName: currentOutlet.name,
        details: format === 'JSON'
          ? 'Downloaded the complete business archive (JSON)'
          : 'Downloaded the accounting export (CSV)',
      });
      showToast(format === 'JSON' ? 'Business archive downloaded.' : 'Accounting export downloaded.');
    } catch (failure) {
      showToast(failure instanceof Error ? failure.message : 'The export failed.');
    } finally {
      setExporting(null);
    }
  };

  const swatches = ACCENT_PRESETS.map((preset) => ({
    label: preset.hex === DEFAULT_ACCENT ? `${preset.name} (Default)` : preset.name,
    hex: preset.hex,
  }));

  const currentRoleConfig =
    editableRoles.find((r) => r.role === selectedRoleForEdit) || editableRoles[0];
  const isOwnRole = currentRoleConfig.role === currentUser.role;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-bounce-subtle">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold">{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-300">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2"><h1 className="text-2xl font-black text-slate-800 tracking-tight">Enterprise System Settings</h1><InfoHint text="Manage stores, staff access, role permissions, security policies, receipt hardware, and appearance." /></div>
            <span className="text-[10px] font-black uppercase bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full border border-slate-300">
              v2.6 Certified
            </span>
          </div>
        </div>
      </div>

      {/* Module Tabs — aligned horizontally across the top of the page */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-2xs p-1.5">
        <div className="flex flex-wrap items-stretch gap-1">
          {visibleTabs.map(({ key, label, hint, icon: Icon }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-accent-500 text-white shadow-xs shadow-accent-500/20'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
                title={hint}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex items-center gap-1.5">
                  <span>{label}</span>
                  {key === 'users' && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {users.length}
                    </span>
                  )}
                  {key === 'outlets' && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {outlets.length}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Module Panel */}
      <div className="space-y-6">
          {/* TAB 1: GENERAL STORE PROFILE & TAX */}
          {activeTab === 'general' && permissions.has('settings.general') && (
            <div className="bg-white rounded-xl border border-slate-300 p-6 shadow-2xs space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Store Profile &amp; Compliance Configuration
                  </h2>
                  <p className="text-xs text-slate-500">
                    Set up your enterprise legal identity, Ghana Revenue Authority (GRA) tax parameters, and currency rules.
                  </p>
                </div>
                <button
                  onClick={handleSaveGeneral}
                  className="flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Changes</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Company / Enterprise Legal Name</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500 font-medium"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-slate-700">Business logo</label>
                  <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 border border-slate-300 rounded-xl">
                    {hasLogo ? (
                      <img
                        src={`/api/settings/logo?v=${logoVersion}`}
                        alt="Business logo"
                        className="h-12 w-auto max-w-[160px] object-contain bg-white rounded-lg border border-slate-200 p-1"
                      />
                    ) : (
                      <span className="text-[11px] text-slate-500">No logo uploaded.</span>
                    )}
                    <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-black text-white text-[11px] font-bold">
                      {logoBusy ? 'Saving…' : hasLogo ? 'Replace' : 'Upload'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                        className="hidden"
                        disabled={logoBusy}
                        onChange={(event) => {
                          void handleLogoChosen(event.target.files?.[0]);
                          // Cleared so choosing the same file twice fires again.
                          event.target.value = '';
                        }}
                      />
                    </label>
                    {hasLogo && (
                      <button
                        type="button"
                        disabled={logoBusy}
                        onClick={() => void handleLogoRemoved()}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-[11px] font-bold hover:bg-slate-50 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                    <span className="text-[11px] text-slate-500">
                      PNG, JPEG, WebP, GIF or SVG, up to 512&nbsp;KB. It prints on receipts and is
                      carried by the database backup.
                    </span>
                  </div>
                  {logoError && (
                    <p className="text-[11px] font-bold text-rose-700">{logoError}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">GRA Tax Registration Number (TIN)</label>
                  <input
                    type="text"
                    value={taxRegNo}
                    onChange={(e) => setTaxRegNo(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Primary Currency Symbol &amp; Code</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={currencySymbol}
                      onChange={(e) => setCurrencySymbol(e.target.value)}
                      className="w-24 px-3.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500 font-bold text-center"
                    />
                    <input
                      type="text"
                      disabled
                      value="GHS (Ghanaian Cedi)"
                      className="flex-1 px-3.5 py-2 text-xs bg-slate-100 border border-slate-300 rounded-xl text-slate-500 font-medium cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Cash Register Rounding Rule</label>
                  <select
                    value={cashRounding}
                    onChange={(e) => setCashRounding(e.target.value as any)}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500"
                  >
                    <option value="exact">Exact (No Rounding - e.g. GH₵ 12.37)</option>
                    <option value="0.10">Round to nearest 10 Pesewas (e.g. GH₵ 12.40)</option>
                    <option value="0.50">Round to nearest 50 Pesewas (e.g. GH₵ 12.50)</option>
                  </select>
                </div>
              </div>

              {/* Tax Toggle & Rate */}
              <div className="pt-4 border-t border-slate-200 space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-300">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-800">Enable Value Added Tax (VAT / NHIL / GETFund)</div>
                    <div className="text-[11px] text-slate-500">
                      When enabled, tax is calculated as a separate line during checkout.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={taxEnabled}
                    onChange={(e) => setTaxEnabled(e.target.checked)}
                    className="w-5 h-5 accent-accent-500 rounded cursor-pointer"
                  />
                </div>

                {taxEnabled && (
                  <div className="p-4 bg-accent-50/60 border border-accent-200 rounded-xl flex items-center gap-4">
                    <div className="space-y-1 flex-1">
                      <label className="text-xs font-bold text-accent-950">Combined Tax Rate (%)</label>
                      <p className="text-[11px] text-accent-800">Standard rate for Ghana commercial sales is 21.9%.</p>
                    </div>
                    <div className="w-32 flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-accent-300">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={taxRate}
                        onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                        className="w-full text-xs font-bold text-slate-800 focus:outline-none"
                      />
                      <span className="text-xs text-slate-400 font-bold">%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Outlets Overview */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-800">Configured Branch Outlets</div>
                  <button
                    onClick={() => setActiveTab('outlets')}
                    className="text-[11px] font-bold text-accent-600 hover:text-accent-700 underline cursor-pointer"
                  >
                    Manage branches &amp; staff
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {outlets.map((o) => (
                    <div
                      key={o.id}
                      className="p-3.5 bg-slate-50 rounded-xl border border-slate-300 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-slate-800">{o.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {o.active === false && (
                            <span className="text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-300 px-2 py-0.5 rounded">
                              Deactivated
                            </span>
                          )}
                          <span className="text-[10px] font-mono font-bold bg-accent-100 text-accent-700 px-2 py-0.5 rounded">
                            {o.receiptPrefix}
                          </span>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                        <Store className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {o.town} • {o.address}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {o.phone} • Mgr: {o.managerName}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: STORES & BRANCHES */}
          {activeTab === 'outlets' && permissions.has('settings.general') && (
            <div className="bg-white rounded-xl border border-slate-300 p-5 shadow-2xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Stores &amp; Branch Network</h2>
                  <p className="text-xs text-slate-500">
                    Register new shops, keep receipt prefixes unique, and assign the staff who
                    operate each branch.
                  </p>
                </div>
                <button
                  onClick={handleOpenNewBranchModal}
                  className="flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>Set Up New Store / Branch</span>
                </button>
              </div>

              {/* Network summary */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Total Branches', value: outlets.length },
                  { label: 'Trading', value: outlets.filter((o) => o.active !== false).length },
                  { label: 'Deactivated', value: outlets.filter((o) => o.active === false).length },
                  {
                    label: 'Unassigned Staff (HQ)',
                    value: users.filter((u) => u.outletId === 'all-outlets').length,
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="p-3.5 bg-slate-50 rounded-xl border border-slate-300"
                  >
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      {stat.label}
                    </div>
                    <div className="text-xl font-black text-slate-900 font-mono mt-0.5">
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Branch register */}
              <div className="border border-slate-300 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[860px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-300 text-[11px] font-black uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-3">Branch</th>
                      <th className="py-3 px-3">Location</th>
                      <th className="py-3 px-3">Branch Manager</th>
                      <th className="py-3 px-3">Receipt Prefix</th>
                      <th className="py-3 px-3">Assigned Staff</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {outlets.map((o) => {
                      const staff = staffCountForBranch(o.id);
                      const isOpen = o.active !== false;
                      return (
                        <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-accent-50 border border-accent-200 text-accent-600 flex items-center justify-center shrink-0">
                                <Store className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="font-bold text-slate-900">{o.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{o.id}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-3">
                            <div className="font-medium text-slate-700">{o.town}</div>
                            <div className="text-[10px] text-slate-400">{o.address}</div>
                          </td>
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            <div className="font-medium text-slate-700">{o.managerName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{o.phone}</div>
                          </td>
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-300 px-2 py-0.5 rounded">
                              {o.receiptPrefix}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            <button
                              onClick={() => {
                                setAssignBranch(o);
                                setAssignSearch('');
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors cursor-pointer"
                              title={`Assign or release staff for ${o.name}`}
                            >
                              <Users className="w-3.5 h-3.5 text-slate-500" />
                              <span>
                                {staff} {staff === 1 ? 'member' : 'members'}
                              </span>
                            </button>
                          </td>
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                isOpen
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                  : 'bg-rose-50 text-rose-700 border-rose-300'
                              }`}
                            >
                              {isOpen ? 'Trading' : 'Deactivated'}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenEditBranchModal(o)}
                                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
                                title="Edit branch profile"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleToggleBranchActive(o)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors border ${
                                  isOpen
                                    ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-300'
                                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-300'
                                }`}
                              >
                                {isOpen ? 'Deactivate' : 'Reopen'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] text-slate-500">
                Branches are never deleted — deactivating one keeps its sales history and stock
                ledger intact while blocking new sign-ins and transactions.
              </p>
            </div>
          )}

          {/* TAB 3: USER ACCOUNTS & STAFF MANAGEMENT */}
          {activeTab === 'users' && permissions.has('user.manage') && (
            <div className="bg-white rounded-xl border border-slate-300 p-5 shadow-2xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Staff Credentials &amp; Accounts</h2>
                  <p className="text-xs text-slate-500">
                    Manage team logins, branch permissions, 4-digit PIN access, and user statuses.
                  </p>
                </div>
                <button
                  onClick={handleOpenNewUserModal}
                  className="flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Add New Staff User</span>
                </button>
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search by staff name, username, or phone..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500"
                  />
                </div>
                <select
                  value={userOutletFilter}
                  onChange={(e) => setUserOutletFilter(e.target.value)}
                  className="px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500 font-medium"
                >
                  <option value="all">All Branches</option>
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({o.town})
                    </option>
                  ))}
                </select>
              </div>

              {/* Users Table */}
              <div className="border border-slate-300 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[840px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-300 text-[11px] font-black uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-3">Staff Member</th>
                      <th className="py-3 px-3">Role</th>
                      <th className="py-3 px-3">Branch Assignment</th>
                      <th className="py-3 px-3">Password &amp; Security</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {filteredUsers.map((u) => {
                      const roleConfig = rolesPermissions.find((r) => r.role === u.role);
                      return (
                        <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-3">
                            <div className="flex items-center gap-3">
                              <img
                                src={u.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80'}
                                alt={u.fullName}
                                className="w-8 h-8 rounded-full object-cover border border-slate-300 shrink-0"
                              />
                              <div className="whitespace-nowrap">
                                <div className="font-bold text-slate-900">{u.fullName}</div>
                                <div className="text-[11px] text-slate-400 font-mono">@{u.username}</div>
                                <div className="text-[11px] text-slate-400 font-mono">{u.phone}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap ${
                                roleConfig ? roleConfig.badgeColor : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {roleConfig?.roleTitle || u.role}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            <div className="text-xs text-slate-700 font-medium leading-tight">
                              <div>
                                {u.outletId === 'all-outlets'
                                  ? 'All Outlets'
                                  : outlets.find((o) => o.id === u.outletId)?.name || 'Unassigned'}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {u.outletId === 'all-outlets'
                                  ? 'Cloud Console'
                                  : outlets.find((o) => o.id === u.outletId)?.town || '—'}
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            {u.mustChangePasswordOnNextLogin ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                                    <KeyRound className="w-3 h-3 text-amber-600 shrink-0" />
                                    <span>Change on Login</span>
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                  <span className="text-amber-700 font-medium">Flag: Active</span>
                                  <span className="text-slate-300">•</span>
                                  <button
                                    onClick={() => handleToggleMustChangePasswordFlag(u.id)}
                                    className="text-slate-400 hover:text-rose-600 underline cursor-pointer"
                                    title="Clear mandatory next-login password update requirement"
                                  >
                                    Clear
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium">
                                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span>Secure</span>
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {u.passwordResetAt ? `Reset: ${u.passwordResetAt.split(' ')[0]}` : 'Up to date'}
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                u.active
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {u.active ? 'Active' : 'Suspended'}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Reset Password Trigger */}
                              <button
                                onClick={() => handleOpenResetPasswordModal(u)}
                                className="inline-flex items-center justify-center p-1.5 rounded-lg bg-accent-50 text-accent-700 hover:bg-accent-100 border border-accent-300 transition-colors cursor-pointer"
                                title="Reset staff password & enforce next-login update"
                              >
                                <KeyRound className="w-4 h-4 shrink-0" />
                              </button>

                              {/* Interactive Simulation Button if flag is active */}
                              {u.mustChangePasswordOnNextLogin && (
                                <button
                                  onClick={() => handleOpenSimulateLoginPrompt(u)}
                                  className="inline-flex items-center justify-center p-1.5 rounded-lg bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-400 transition-colors cursor-pointer"
                                  title="Simulate user logging in and completing the password update prompt"
                                >
                                  <PlayCircle className="w-4 h-4 shrink-0" />
                                </button>
                              )}

                              <button
                                onClick={() => setPermissionsFor(u)}
                                className="inline-flex items-center justify-center p-1.5 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-300 transition-colors cursor-pointer"
                                title="Permissions for this person (FR-USER-03)"
                              >
                                <ShieldCheck className="w-4 h-4 shrink-0" />
                              </button>
                              <button
                                onClick={() => handleOpenEditUserModal(u)}
                                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
                                title="Edit User Details"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleToggleUserActive(u.id)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors ${
                                  u.active
                                    ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                }`}
                              >
                                {u.active ? 'Suspend' : 'Activate'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: ROLES & PERMISSIONS MATRIX */}
          {activeTab === 'permissions' && permissions.has('user.manage') && (
            <div className="bg-white rounded-xl border border-slate-300 p-6 shadow-2xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Role-Based Access Control (RBAC) &amp; Permissions
                  </h2>
                  <p className="text-xs text-slate-500">
                    Grant or revoke the PRD permission codes per role. The server authorises every
                    endpoint against these same codes, so what is unchecked here is refused there too.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleResetRolePermissions}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-300 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                  <button
                    onClick={handleSaveRolePermissions}
                    className="flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save Permissions</span>
                  </button>
                </div>
              </div>

              {/* Role Selection Tabs */}
              <div className="flex flex-wrap gap-2 pb-2">
                {editableRoles.map((r) => (
                  <button
                    key={r.role}
                    onClick={() => setSelectedRoleForEdit(r.role)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      selectedRoleForEdit === r.role
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {r.roleTitle}
                  </button>
                ))}
              </div>

              {/* Selected Role Card Info */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-300 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-900">
                    {currentRoleConfig.roleTitle}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border ${currentRoleConfig.badgeColor}`}
                  >
                    {currentRoleConfig.role}
                  </span>
                </div>
                <p className="text-xs text-slate-600">{currentRoleConfig.description}</p>
                {isOwnRole && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-800">
                    <Lock className="h-3.5 w-3.5" />
                    This is your own role. Permission changes cannot be self-applied (BR-16).
                  </p>
                )}
              </div>

              {/* Permission matrix — every PRD §6 code, grouped */}
              <div className="space-y-5">
                {PERMISSION_GROUPS.map((group) => {
                  const groupPermissions = PERMISSION_CATALOGUE.filter((item) => item.group === group);
                  if (groupPermissions.length === 0) return null;
                  return (
                    <div key={group} className="space-y-3">
                      <div className="flex items-baseline gap-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">{group}</div>
                        <div className="text-[10px] text-slate-400">
                          {groupPermissions.filter((item) => currentRoleConfig.permissions.includes(item.code)).length}
                          {' of '}
                          {groupPermissions.length} granted
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {groupPermissions.map((item) => {
                          const granted = currentRoleConfig.permissions.includes(item.code);
                          return (
                            <label
                              key={item.code}
                              className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                                isOwnRole ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                              } ${
                                granted
                                  ? 'bg-accent-50/40 border-accent-200'
                                  : 'bg-white border-slate-300 hover:border-accent-200'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={granted}
                                disabled={isOwnRole}
                                onChange={() => handleTogglePermission(selectedRoleForEdit, item.code)}
                                className="w-4 h-4 mt-0.5 accent-accent-500 rounded disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                              />
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-800">{item.label}</div>
                                <div className="text-[11px] text-slate-500">{item.description}</div>
                                <code className="mt-1 inline-block text-[10px] font-mono text-slate-400">{item.code}</code>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: SECURITY & MANAGER PIN */}
          {activeTab === 'security' && permissions.has('settings.general') && (
            <div className="bg-white rounded-xl border border-slate-300 p-6 shadow-2xs space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Security &amp; Manager Override PIN</h2>
                  <p className="text-xs text-slate-500">
                    Control the master manager authorization PIN and mandatory enforcement policies across terminals.
                  </p>
                </div>
                <button
                  onClick={handleSaveSecurity}
                  className="flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Update Security</span>
                </button>
              </div>

              {/* FR-AUTH-02: your own approval PIN, not a shared one */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-300 space-y-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-accent-500" />
                    Your approval PIN
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Typed at the counter when you authorise a floor-price override or a void.
                    It is yours alone — the approval is recorded against your name, so a PIN
                    the whole shop knows would record nothing.
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative w-40">
                    <input
                      type={showPin ? 'text' : 'password'}
                      maxLength={6}
                      inputMode="numeric"
                      placeholder="••••"
                      value={ownPin}
                      onChange={(e) => setOwnPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-4 py-2.5 text-center tracking-[0.5em] font-mono text-lg font-black bg-white border border-slate-300 rounded-xl focus:outline-accent-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <input
                    type="password"
                    autoComplete="current-password"
                    placeholder="Your password"
                    value={pinPassword}
                    onChange={(e) => setPinPassword(e.target.value)}
                    className="flex-1 min-w-[12rem] px-4 py-2.5 text-xs bg-white border border-slate-300 rounded-xl focus:outline-accent-500"
                  />

                  <button
                    type="button"
                    onClick={() => void handleSetOwnPin()}
                    disabled={pinSaving}
                    className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    {pinSaving ? 'Setting…' : 'Set my PIN'}
                  </button>
                </div>

                <div className="text-[11px] text-slate-400">
                  4 to 6 digits. Your password is asked for so an unattended screen cannot be
                  used to set one.
                </div>
              </div>

              {/* Policy Enforcements */}
              <div className="space-y-3 pt-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Mandatory Policy Enforcements
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-300">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-slate-800">
                        Enforce Manager PIN on Floor Price Breach
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Prevents selling below product minimum margin unless authorized with manager PIN.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={enforceFloorPin}
                      onChange={(e) => setEnforceFloorPin(e.target.checked)}
                      className="w-5 h-5 accent-accent-500 rounded cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-300">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-slate-800">
                        Enforce Manager PIN on Sale Void
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Completed sales are immutable. Voiding requires manager authorization PIN and mandatory audit reason.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={enforceVoidPin}
                      onChange={(e) => setEnforceVoidPin(e.target.checked)}
                      className="w-5 h-5 accent-accent-500 rounded cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-300">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-slate-800">
                        Enforce Blind Cash Drawer Count on Shift Close
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Cashiers do not see expected register total before submitting their counted physical cash.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={enforceBlindShift}
                      onChange={(e) => setEnforceBlindShift(e.target.checked)}
                      className="w-5 h-5 accent-accent-500 rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: HARDWARE & RECEIPTS */}
          {/* K-08 / FR-SET-06: the limits the business rules read from */}
          {activeTab === 'thresholds' && permissions.has('settings.general') && (
            <div className="bg-white rounded-xl border border-slate-300 p-6 shadow-2xs space-y-6">
              <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Operational thresholds</h2>
                  <p className="text-xs text-slate-500">
                    The limits that decide when the system asks for approval or an explanation.
                  </p>
                </div>
                <button
                  onClick={handleSaveThresholds}
                  className="flex cursor-pointer items-center gap-2 rounded-xl bg-accent-500 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-accent-600"
                >
                  <Save className="h-4 w-4" />
                  <span>Save thresholds</span>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <label className="block text-xs font-bold text-slate-700">
                  Idle lock (minutes)
                  <input
                    type="number"
                    min="1"
                    value={thresholdDraft.idleLockMinutes}
                    onChange={(event) =>
                      setThresholdDraft((prev) => ({ ...prev, idleLockMinutes: Number(event.target.value) || 0 }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-bold text-slate-900"
                  />
                  <span className="mt-1 block text-[11px] font-normal text-slate-500">
                    FR-AUTH-05 — the POS locks rather than signing out when a shift is open.
                  </span>
                </label>

                <label className="block text-xs font-bold text-slate-700">
                  Adjustment approval above (GH₵)
                  <input
                    type="number"
                    min="0"
                    value={thresholdDraft.adjustmentApprovalValue}
                    onChange={(event) =>
                      setThresholdDraft((prev) => ({
                        ...prev,
                        adjustmentApprovalValue: Number(event.target.value) || 0,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-bold text-slate-900"
                  />
                  <span className="mt-1 block text-[11px] font-normal text-slate-500">
                    FR-INV-06 — needs <code className="font-mono">stock.approve_adjustment</code>.
                  </span>
                </label>

                <label className="block text-xs font-bold text-slate-700">
                  Cash variance explanation above (GH₵)
                  <input
                    type="number"
                    min="0"
                    value={thresholdDraft.cashVarianceExplain}
                    onChange={(event) =>
                      setThresholdDraft((prev) => ({
                        ...prev,
                        cashVarianceExplain: Number(event.target.value) || 0,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-bold text-slate-900"
                  />
                  <span className="mt-1 block text-[11px] font-normal text-slate-500">
                    FR-CASH-06 — a written note is required past this.
                  </span>
                </label>
              </div>

              <div className="space-y-3 border-t border-slate-200 pt-5">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Discount ceiling per role (FR-POS-10)
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {ROLE_ORDER.map((role) => (
                    <label key={role} className="block text-xs font-bold text-slate-700">
                      {ROLE_LABELS[role]} (%)
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={thresholdDraft.discountCeilingByRole[role]}
                        onChange={(event) =>
                          setThresholdDraft((prev) => ({
                            ...prev,
                            discountCeilingByRole: {
                              ...prev.discountCeilingByRole,
                              [role]: Math.min(100, Math.max(0, Number(event.target.value) || 0)),
                            },
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-bold text-slate-900"
                      />
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">
                  A cashier attempting more than their ceiling needs manager approval by PIN.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'printers' && permissions.has('settings.terminal') && (
            <div className="bg-white rounded-xl border border-slate-300 p-6 shadow-2xs space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Thermal Printer &amp; Receipt Design</h2>
                  <p className="text-xs text-slate-500">
                    Customize physical receipt layout, header branding, and customer return policies.
                  </p>
                </div>
                <button
                  onClick={handleSavePrinters}
                  className="flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Receipt Format</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Form Controls */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Thermal Paper Width</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setPrinterWidth('80mm')}
                        className={`p-3 rounded-xl border text-xs font-bold transition-all text-left cursor-pointer ${
                          printerWidth === '80mm'
                            ? 'border-accent-500 bg-accent-50/50 text-accent-700'
                            : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div className="font-extrabold text-sm">80mm Wide</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Standard commercial POS receipt (48 cols)
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPrinterWidth('58mm')}
                        className={`p-3 rounded-xl border text-xs font-bold transition-all text-left cursor-pointer ${
                          printerWidth === '58mm'
                            ? 'border-accent-500 bg-accent-50/50 text-accent-700'
                            : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div className="font-extrabold text-sm">58mm Compact</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Compact mobile receipt (32 cols)
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Receipt Header Promotional Note</label>
                    <textarea
                      rows={2}
                      value={receiptHeader}
                      onChange={(e) => setReceiptHeader(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Receipt Footer Return Policy</label>
                    <textarea
                      rows={2}
                      value={receiptFooter}
                      onChange={(e) => setReceiptFooter(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500"
                    />
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-300">
                      <span className="text-xs font-bold text-slate-800">Auto-Print on Completed Sale</span>
                      <input
                        type="checkbox"
                        checked={autoPrint}
                        onChange={(e) => setAutoPrint(e.target.checked)}
                        className="w-4 h-4 accent-accent-500 rounded cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-300">
                      <span className="text-xs font-bold text-slate-800">Print Cashier Name &amp; Terminal Tag</span>
                      <input
                        type="checkbox"
                        checked={showCashier}
                        onChange={(e) => setShowCashier(e.target.checked)}
                        className="w-4 h-4 accent-accent-500 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* FR-RCPT-09: the server's own renderer, at this width. */}
                <div className="lg:col-span-5 bg-slate-100 p-4 rounded-xl border border-slate-300 flex flex-col items-center">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Thermal preview ({printerWidth})
                  </div>
                  {/*
                    Rendered by `/api/receipts/preview`, which is the same layout
                    the printer is handed. What was here instead was a hand-built
                    mock-up in JSX — a second renderer with its own idea of the
                    columns, a receipt number of INC-004312 and a cashier called
                    Kwame A. A preview whose only job is to show what will print
                    should not be capable of disagreeing with it.
                  */}
                  {receiptPreviewError ? (
                    <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                      {receiptPreviewError}
                    </p>
                  ) : receiptPreview.length === 0 ? (
                    <p className="text-xs text-slate-500">Rendering&hellip;</p>
                  ) : (
                    <pre className={`bg-white shadow-md p-4 rounded-md border border-slate-300 font-mono text-[11px] leading-[1.35] text-slate-800 overflow-x-auto ${
                      printerWidth === '80mm' ? 'w-72' : 'w-56'
                    }`}>
{receiptPreview.join('\n')}
                    </pre>
                  )}
                  <p className="mt-2 text-[10px] text-slate-400 text-center">
                    {printerWidth === '80mm' ? '48' : '32'} columns, as the printer receives it.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: APPEARANCE & THEME */}
          {activeTab === 'appearance' && permissions.has('settings.appearance') && (
            <div className="bg-white rounded-xl border border-slate-300 p-6 shadow-2xs space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Visual Personalization &amp; Themes</h2>
                  <p className="text-xs text-slate-500">
                    Customize the accent, typeface and text size across the workspace.
                  </p>
                </div>
                <button
                  onClick={() => onUpdateAppearance({
                    accentColor: DEFAULT_ACCENT,
                    fontFamily: 'JAKARTA',
                    fontScalePercent: 100,
                  })}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-300 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Default</span>
                </button>
              </div>

              {/* Accent Color Picker */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-800">Preset Brand Accents</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                  {swatches.map((s) => (
                    <button
                      key={s.hex}
                      onClick={() => onChangeAccent(s.hex)}
                      className={`p-2.5 rounded-xl border flex flex-col items-center gap-2 transition-all cursor-pointer ${
                        accentColor === s.hex
                          ? 'border-slate-900 bg-slate-50 shadow-xs'
                          : 'border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center shadow-xs"
                        style={{ backgroundColor: s.hex }}
                      >
                        {accentColor === s.hex && (
                          <Check className="w-4 h-4 text-white stroke-[3]" />
                        )}
                      </div>
                      <span className="text-[11px] font-bold text-slate-700 text-center">
                        {s.label}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Custom Hex Code */}
                <div className="pt-2 max-w-sm space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Custom HEX Color Code</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customHex}
                      onChange={(e) => setCustomHex(e.target.value)}
                      placeholder={DEFAULT_ACCENT}
                      className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500"
                    />
                    <button
                      onClick={() => {
                        if (/^#[0-9A-F]{6}$/i.test(customHex)) {
                          // Acceptance criterion 11: no blue anywhere in the palette.
                          if (isBlue(customHex)) {
                            showToast('Blue is not part of the palette. Choose Orange, Amber, Crimson, Plum, Forest, Teal or Graphite.');
                            return;
                          }
                          onChangeAccent(customHex);
                          showToast('Custom accent colour applied.');
                        } else {
                          showToast('Enter a valid 6-digit hex code, e.g. #c55200.');
                        }
                      }}
                      className="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4 border-t border-slate-200 pt-5">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <Type className="h-4 w-4 text-accent-500" />
                  Typography
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {FONT_CHOICES.map((font) => (
                    <button
                      key={font.key}
                      type="button"
                      onClick={() => onUpdateAppearance({
                        accentColor: generalSettings.accentColor,
                        fontFamily: font.key,
                        fontScalePercent: generalSettings.fontScalePercent,
                      })}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        generalSettings.fontFamily === font.key
                          ? 'border-accent-500 bg-accent-50'
                          : 'border-slate-300 hover:bg-slate-50'
                      }`}
                      style={{ fontFamily: font.stack }}
                    >
                      <span className="block text-sm font-bold text-slate-900">{font.label}</span>
                      <span className="mt-1 block text-[10px] text-slate-500">{font.description}</span>
                    </button>
                  ))}
                </div>

                <div className="max-w-xl rounded-xl border border-slate-300 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <span className="text-xs font-bold text-slate-800">
                      Text size
                    </span>
                    <span className="rounded-md bg-white px-2 py-1 text-xs font-black text-slate-700 shadow-2xs">
                      {generalSettings.fontScalePercent}%
                    </span>
                  </div>
                  <div id="font-scale" className="grid grid-cols-5 gap-2" role="group" aria-label="Text size">
                    {[90, 100, 110, 120, 130].map((scale) => (
                      <button
                        key={scale}
                        type="button"
                        onClick={() => onUpdateAppearance({
                          accentColor: generalSettings.accentColor,
                          fontFamily: generalSettings.fontFamily,
                          fontScalePercent: scale,
                        })}
                        className={`rounded-lg border px-2 py-2 text-xs font-bold transition-colors ${
                          generalSettings.fontScalePercent === scale
                            ? 'border-accent-500 bg-accent-50 text-accent-700'
                            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
                        }`}
                        aria-pressed={generalSettings.fontScalePercent === scale}
                      >
                        {scale}%
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-slate-600">
                    Aa · Product names, prices, buttons and reports update immediately.
                  </p>
                </div>
              </div>

              {/* Live Preview Panel */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-300 space-y-3">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Live UI Token Preview
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="px-4 py-2 text-white text-xs font-bold rounded-xl shadow-xs"
                    style={{ backgroundColor: accentColor }}
                  >
                    Primary Button
                  </button>
                  <span
                    className="px-3 py-1 rounded-lg text-xs font-bold border"
                    style={{
                      backgroundColor: `${accentColor}15`,
                      color: accentColor,
                      borderColor: `${accentColor}30`,
                    }}
                  >
                    Active Filter Pill
                  </span>
                  <div className="text-xs font-bold text-slate-700">
                    Accent Color:{' '}
                    <span className="font-mono text-slate-900">{accentColor}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: BACKUP & ACCOUNTING EXPORT */}
          {activeTab === 'backup' && permissions.has('settings.general') && (
            <div className="bg-white rounded-xl border border-slate-300 p-6 shadow-2xs space-y-6">
              <div className="pb-4 border-b border-slate-200">
                <h2 className="text-base font-bold text-slate-900">
                  Data Backup &amp; External Accounting Integration
                </h2>
                <p className="text-xs text-slate-500">
                  Automatic database backups, and exports for your accounting software.
                </p>
              </div>

              {/*
                FR-SET-07 · NFR-6 · NFR-7: the server's backups.

                Above the exports because the two are not the same thing and the
                difference matters. An export is a file an accountant asked for;
                this is what the shop's history is recovered from when the
                counter PC's disk dies.
              */}
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  backupStatus?.healthy
                    ? 'bg-emerald-50/50 border-emerald-200'
                    : 'bg-amber-50/60 border-amber-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                      {backupStatus?.healthy ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                      )}
                      Database Backup
                      <InfoHint text="The copy the shop is recovered from if this machine is lost. Kept on a schedule by the server, not by this browser." />
                    </div>
                    <p className="text-[11px] text-slate-600 max-w-xl">
                      {backupError
                        ? backupError
                        : backupStatus
                          ? backupStatus.summary
                          : 'Reading the backup status…'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => void loadBackupStatus()}
                      title="Re-read the status"
                      className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
                    </button>
                    <button
                      onClick={() => void handleBackupNow()}
                      disabled={backupBusy}
                      className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-black disabled:opacity-60 disabled:cursor-wait text-white px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Database className="w-4 h-4" />
                      <span>{backupBusy ? 'Backing up…' : 'Back Up Now'}</span>
                    </button>
                  </div>
                </div>

                {backupStatus && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] pt-1 border-t border-slate-200/70">
                      <div className="pt-2">
                        <span className="text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> At risk right now:
                        </span>
                        {/* NFR-7 asks for fifteen minutes. This is the live
                            answer, not the configured target. */}
                        <span
                          className={`font-bold ${
                            (backupStatus.recoveryPointMinutes ?? Infinity) > backupStatus.intervalMinutes * 2
                              ? 'text-amber-700'
                              : 'text-slate-800'
                          }`}
                        >
                          {backupStatus.lastSuccess
                            ? formatAge(backupStatus.recoveryPointMinutes)
                            : 'no backup yet'}
                        </span>
                      </div>
                      <div className="pt-2">
                        <span className="text-slate-400 flex items-center gap-1">
                          <CloudUpload className="w-3 h-3" /> Off-site copy:
                        </span>
                        <span
                          className={`font-bold ${
                            backupStatus.lastOffsiteSuccess ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {backupStatus.offsiteConfigured
                            ? formatAge(
                                backupStatus.lastOffsiteSuccess?.finishedAt
                                  ? Math.floor(
                                      (Date.now() - Date.parse(backupStatus.lastOffsiteSuccess.finishedAt)) / 60000,
                                    )
                                  : null,
                              )
                            : 'not set up'}
                        </span>
                      </div>
                      <div className="pt-2">
                        <span className="text-slate-400 flex items-center gap-1">
                          <RefreshCw className="w-3 h-3" /> Runs every:
                        </span>
                        <span className="font-bold text-slate-800">
                          {backupStatus.enabled ? `${backupStatus.intervalMinutes} min` : 'switched off'}
                        </span>
                      </div>
                      <div className="pt-2">
                        <span className="text-slate-400 flex items-center gap-1">
                          <HardDrive className="w-3 h-3" /> Kept for:
                        </span>
                        <span className="font-bold text-slate-800">{backupStatus.retentionDays} days</span>
                      </div>
                    </div>

                    {/* FR-SET-07 asks for restore history too, and a RESTORE row
                        is in here with the rest — putting one back is part of
                        this database's history, not something separate. */}
                    {backupStatus.history.length > 0 && (
                      <div className="pt-1">
                        <div className="text-[11px] font-bold text-slate-700 mb-1.5">Recent runs</div>
                        <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                          <table className="w-full text-[11px]">
                            <thead className="bg-slate-50 text-slate-500 sticky top-0">
                              <tr>
                                <th className="text-left font-semibold px-2.5 py-1.5">When</th>
                                <th className="text-left font-semibold px-2.5 py-1.5">Kind</th>
                                <th className="text-left font-semibold px-2.5 py-1.5">Result</th>
                                <th className="text-left font-semibold px-2.5 py-1.5">Where</th>
                                <th className="text-right font-semibold px-2.5 py-1.5">Size</th>
                              </tr>
                            </thead>
                            <tbody>
                              {backupStatus.history.map((run) => (
                                <tr key={run.id} className="border-t border-slate-100">
                                  <td className="px-2.5 py-1.5 text-slate-700 whitespace-nowrap">
                                    {new Date(run.startedAt).toLocaleString()}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-slate-600">
                                    {run.kind === 'SCHEDULED' ? 'Automatic' : run.kind === 'MANUAL' ? 'By hand' : 'Restore'}
                                  </td>
                                  <td className="px-2.5 py-1.5">
                                    <span
                                      className={`font-bold ${
                                        run.outcome === 'SUCCEEDED'
                                          ? 'text-emerald-700'
                                          : run.outcome === 'FAILED'
                                            ? 'text-rose-700'
                                            : 'text-slate-500'
                                      }`}
                                    >
                                      {run.outcome === 'SUCCEEDED' ? 'Worked' : run.outcome === 'FAILED' ? 'Failed' : 'Running'}
                                    </span>
                                    {/* The reason, in full. "The backup failed"
                                        on its own is a line nobody can act on. */}
                                    {run.error && (
                                      <span className="block text-rose-600/90 leading-tight">{run.error}</span>
                                    )}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-slate-600">
                                    {run.outcome !== 'SUCCEEDED'
                                      ? '—'
                                      : run.storedOffsite
                                        ? 'Off-site'
                                        : 'This machine only'}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-right text-slate-600 whitespace-nowrap">
                                    {formatBytes(run.sizeBytes)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Full System JSON Backup */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-300 space-y-3 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                      <FileText className="w-4 h-4 text-accent-500" />
                      Business data export (JSON)
                    </div>
                    {/*
                      Read from the server, table by table, in one consistent
                      read. What was here before built a file out of whatever
                      this browser had loaded and called it a full backup — at a
                      hundred receipts that is right, and at a hundred and one it
                      is quietly incomplete.
                    */}
                    <p className="text-[11px] text-slate-500">
                      Every record the business holds &mdash; sales, stock, customers, suppliers,
                      staff and settings &mdash; as one archive. For restoring the shop after a
                      failure, use the database backup above.
                    </p>
                  </div>
                  <button
                    onClick={() => void handleExportBusinessData('JSON')}
                    disabled={exporting !== null}
                    className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-black text-white px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>{exporting === 'JSON' ? 'Preparing…' : 'Download business archive (.json)'}</span>
                  </button>
                </div>

                {/* Accounting Compatibility */}
                <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200 space-y-3 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-950">
                      <FileText className="w-4 h-4 text-emerald-600" />
                      Accounting CSV Packages
                    </div>
                    <p className="text-[11px] text-emerald-800">
                      For QuickBooks, Sage, Xero and Excel. The full package is read from the
                      server; the two buttons beneath it export what is on this screen.
                    </p>
                  </div>
                  <button
                    onClick={() => void handleExportBusinessData('CSV')}
                    disabled={exporting !== null}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>{exporting === 'CSV' ? 'Preparing…' : 'Download accounting package (.zip)'}</span>
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        const filename = `sales_export_${currentOutlet.id}_${new Date().toISOString().slice(0, 10)}.csv`;
                        const headers = [
                          'Receipt',
                          'Date',
                          'Store',
                          'Cashier',
                          'Customer',
                          'Payment',
                          'Total (GHS)',
                          'Status',
                        ];
                        const rows = sales.map((s) => [
                          s.receiptNumber,
                          s.createdAt,
                          s.outletName,
                          s.cashierName,
                          s.customerName,
                          s.payments.map((payment) => payment.method).join(' + '),
                          s.total.toFixed(2),
                          s.status,
                        ]);
                        exportToCsv(filename, headers, rows);
                        showToast('Sales CSV downloaded.');
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold py-2 px-2.5 rounded-xl text-center cursor-pointer shadow-2xs"
                    >
                      Export Sales CSV
                    </button>
                    <button
                      onClick={() => {
                        const filename = `products_valuation_${currentOutlet.id}_${new Date().toISOString().slice(0, 10)}.csv`;
                        const headers = ['SKU', 'Name', 'Category', 'Base Unit', 'Retail Price', 'Stock'];
                        const rows = products.map((p) => [
                          p.sku,
                          p.name,
                          p.category,
                          p.baseUnit,
                          p.retailPrice.toFixed(2),
                          p.stock[currentOutlet.id === 'all-outlets' ? outlets[0]?.id : currentOutlet.id] || 0,
                        ]);
                        exportToCsv(filename, headers, rows);
                        showToast('Products CSV downloaded.');
                      }}
                      className="bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-bold py-2 px-2.5 rounded-xl text-center cursor-pointer shadow-2xs"
                    >
                      Export Products CSV
                    </button>
                  </div>
                </div>
              </div>

              {/* System Diagnostic Status */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-300 text-xs space-y-2">
                <div className="font-bold text-slate-800">System Information &amp; Health</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] text-slate-600">
                  <div>
                    <span className="text-slate-400 block">Version:</span>
                    <span className="font-bold text-slate-800">POS System v2.6</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Active Store Outlets:</span>
                    <span className="font-bold text-slate-800">{outlets.length} Branches</span>
                  </div>
                  {/*
                    Was a hardcoded "IndexedDB Synced", which was a green light
                    for something this build does not do. A health panel that
                    invents a reassurance is worse than a shorter one, so it now
                    shows a fact the server answered for.
                  */}
                  <div>
                    <span className="text-slate-400 block">Last Good Backup:</span>
                    <span
                      className={`font-bold ${
                        backupStatus?.lastSuccess ? 'text-emerald-600' : 'text-amber-600'
                      }`}
                    >
                      {backupStatus?.lastSuccess ? formatAge(backupStatus.recoveryPointMinutes) : 'none yet'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Catalog SKUs:</span>
                    <span className="font-bold text-slate-800">{products.length} Products</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: CLOUD SYNC — the two R2 channels */}
          {activeTab === 'sync' && permissions.has('sync.push') && (
            <div className="bg-white rounded-xl border border-slate-300 p-6 shadow-2xs space-y-6">
              <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    Cloud Sync
                    <InfoHint text="Configuration comes down from cloud storage; trading uploads to it. Neither is needed to sell — a shop trades through any outage." />
                  </h2>
                  <p className="text-xs text-slate-500">
                    {syncStatus
                      ? syncStatus.summary
                      : syncError
                        ? syncError
                        : 'Reading the sync status…'}
                  </p>
                </div>
                <button
                  onClick={() => void loadSyncStatus()}
                  title="Re-read the status"
                  className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
                </button>
              </div>

              {/* No bucket, no channels. Said plainly rather than by every
                  button failing one at a time. */}
              {syncStatus && !syncStatus.configured && (
                <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-300 text-xs font-bold text-amber-900">
                  No storage bucket is configured, so nothing can be published or sent.
                  Add the off-site keys in the environment and restart.
                </div>
              )}

              {syncStatus && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                  <div>
                    <span className="text-slate-400 block">This instance:</span>
                    <span className="font-bold text-slate-800">
                      {syncStatus.mode === 'CONSOLIDATOR' ? 'Cloud console' : 'Shop counter'}
                      {syncStatus.outletCode ? ` · ${syncStatus.outletCode}` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Waiting to send:</span>
                    {/* Not an alarm. The till does not need the network to
                        trade; this only says how far behind Cloud Sync is. */}
                    <span className={`font-bold ${syncStatus.pendingRows > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {syncStatus.pendingRows === 0 ? 'nothing' : `${syncStatus.pendingRows} row(s)`}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Last sent:</span>
                    <span className="font-bold text-slate-800">{staleness(syncStatus.lastPushedAt)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Configuration pulled:</span>
                    <span className="font-bold text-slate-800">{staleness(syncStatus.configPulledAt)}</span>
                  </div>
                </div>
              )}

              {syncResult && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
                  {syncResult}
                </div>
              )}
              {syncError && syncStatus && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800">
                  {syncError}
                </div>
              )}

              {permissions.has('settings.general') && (
                <div className="rounded-xl border border-accent-200 bg-accent-50/60 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="max-w-2xl">
                      <label htmlFor="cloud-sync-interval" className="text-xs font-black text-slate-900">
                        Automatic upload frequency
                      </label>
                      <p className="mt-1 text-[11px] leading-5 text-slate-500">
                        Choose how often this counter sends pending trading data to Cloud Sync.
                        Longer intervals reduce cloud requests. Manual sync remains available below.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        id="cloud-sync-interval"
                        value={cloudSyncIntervalMinutes}
                        onChange={(event) => setCloudSyncIntervalMinutes(Number(event.target.value))}
                        className="min-w-40 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-800"
                      >
                        <option value={15}>Every 15 minutes</option>
                        <option value={30}>Every 30 minutes</option>
                        <option value={60}>Every hour</option>
                        <option value={120}>Every 2 hours</option>
                        <option value={240}>Every 4 hours</option>
                        <option value={360}>Every 6 hours</option>
                        <option value={720}>Every 12 hours</option>
                        <option value={1440}>Every 24 hours</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleSaveCloudSyncInterval}
                        disabled={cloudSyncIntervalMinutes === generalSettings.cloudSyncIntervalMinutes}
                        className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Save interval
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 text-[10px] font-semibold text-slate-500">
                    Approximately {Math.ceil(1440 / cloudSyncIntervalMinutes)} automatic sync checks per day.
                  </p>
                </div>
              )}

              <div className={`grid grid-cols-1 gap-4 ${
                permissions.has('settings.general') ? 'md:grid-cols-2' : ''
              }`}>
                {/* ── Channel 1, down: the owner publishes, a shop pulls ──
                    Administrators only. Pulling rewrites this counter's staff and
                    can move its outlet id, which is not a closing-up task. */}
                {permissions.has('settings.general') && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-300 space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                      <Download className="w-4 h-4 text-accent-500" />
                      Configuration
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Products, prices, staff and settings. Published by the owner, pulled by each
                      shop — one direction only, so a branch can never overwrite cloud configuration.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[11px] font-bold text-slate-700">
                      Publish for a branch
                    </label>
                    <select
                      value={syncOutletId}
                      onChange={(event) => setSyncOutletId(event.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-accent-500"
                    >
                      <option value="">Choose a branch…</option>
                      {outlets
                        .filter((outlet) => outlet.id !== 'all-outlets')
                        .map((outlet) => (
                          <option key={outlet.id} value={outlet.id}>{outlet.name}</option>
                        ))}
                    </select>
                    <button
                      onClick={() => void runSync('Publish', () => syncApi.publishConfiguration(syncOutletId))}
                      disabled={!syncOutletId || syncBusy !== null || !syncStatus?.configured}
                      className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed text-white px-3.5 py-2.5 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      <CloudUpload className="w-4 h-4" />
                      <span>{syncBusy === 'Publish' ? 'Publishing…' : 'Publish configuration'}</span>
                    </button>
                  </div>

                  <div className="pt-2 border-t border-slate-200">
                    <button
                      onClick={() => void runSync('Get configuration', syncApi.getConfiguration)}
                      disabled={syncBusy !== null || !syncStatus?.configured}
                      className="w-full flex items-center justify-center gap-2 border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed text-slate-800 px-3.5 py-2.5 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>{syncBusy === 'Get configuration' ? 'Applying…' : 'Get configuration'}</span>
                    </button>
                    <p className="mt-2 text-[10px] text-slate-400 leading-snug">
                      Safe to run again at any time. This is the button a new counter presses once
                      the owner has published — it sets the whole shop up.
                    </p>
                  </div>
                </div>
                )}

                {/* ── Channel 2, up: the shop pushes, the owner ingests ── */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-300 space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                      <CloudUpload className="w-4 h-4 text-accent-500" />
                      Trading
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Sales, returns, stock, shifts, cash and the audit log. Sent in batches; each
                      one is numbered, so a missing batch is visible rather than silent.
                    </p>
                  </div>

                  <button
                    onClick={() => void runSync('Send', syncApi.push)}
                    disabled={syncBusy !== null || !syncStatus?.configured}
                    className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed text-white px-3.5 py-2.5 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    <CloudUpload className="w-4 h-4" />
                    <span>{syncBusy === 'Send' ? 'Sending…' : 'Sync trading now'}</span>
                  </button>

                  {permissions.has('settings.general') && (
                  <div className="pt-2 border-t border-slate-200">
                    <button
                      onClick={() => void runSync('Update', syncApi.ingest)}
                      disabled={syncBusy !== null || !syncStatus?.configured}
                      className="w-full flex items-center justify-center gap-2 border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed text-slate-800 px-3.5 py-2.5 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>{syncBusy === 'Update' ? 'Bringing in…' : 'Update from the shops'}</span>
                    </button>
                    <p className="mt-2 text-[10px] text-slate-400 leading-snug">
                      The owner presses this. Batches already taken in are skipped, so pressing it
                      twice changes nothing.
                    </p>
                  </div>
                  )}

                  {/* What exactly is waiting, so "12 rows" is checkable. */}
                  {syncStatus && Object.keys(syncStatus.pendingByTable).length > 0 && (
                    <div className="pt-2 border-t border-slate-200">
                      <div className="text-[11px] font-bold text-slate-700 mb-1.5">Waiting to send</div>
                      <div className="space-y-1">
                        {Object.entries(syncStatus.pendingByTable).map(([table, count]) => (
                          <div key={table} className="flex justify-between text-[11px]">
                            <span className="text-slate-500">{table.replace(/_/g, ' ')}</span>
                            <span className="font-bold text-slate-800">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <p className="text-[10px] text-slate-400 leading-snug border-t border-slate-200 pt-3">
                None of this is needed to sell. A shop records every sale locally and trades through
                any outage; these buttons only decide how current the owner&apos;s view is. Trading
                is also sent automatically every fifteen minutes, so pressing Send at closing time
                confirms the day has gone rather than being the only thing that sends it.
              </p>
            </div>
          )}

      </div>

      {/* SET UP / EDIT STORE BRANCH MODAL */}
      {isBranchModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-70 flex items-center justify-center p-4 sm:p-6 animate-modal-backdrop">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-300 animate-modal-card">
            <div className="p-5 sm:p-6 border-b border-slate-300 flex items-center justify-between bg-slate-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-100 text-accent-600 flex items-center justify-center shrink-0">
                  <Store className="w-5 h-5 text-accent-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {editingBranch ? `Edit Branch — ${editingBranch.name}` : 'Set Up a New Store / Branch'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Register the shop profile, then tick the staff who will operate it.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBranchModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBranch} className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
              {/* Branch profile */}
              <div className="space-y-4">
                <div className="text-xs font-black uppercase tracking-wider text-slate-400">
                  1. Branch Profile
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-700">Store / Branch Name *</label>
                    <input
                      type="text"
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                      placeholder="e.g. Radiance Lighting Takoradi"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500 font-medium"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-700">Town / City *</label>
                    <input
                      type="text"
                      value={branchTown}
                      onChange={(e) => setBranchTown(e.target.value)}
                      placeholder="e.g. Takoradi"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500 font-medium"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700">Street Address</label>
                  <input
                    type="text"
                    value={branchAddress}
                    onChange={(e) => setBranchAddress(e.target.value)}
                    placeholder="e.g. 24 Beach Road, Market Circle"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500 font-medium"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-700">Branch Phone</label>
                    <input
                      type="text"
                      value={branchPhone}
                      onChange={(e) => setBranchPhone(e.target.value)}
                      placeholder="+233 24 000 0000"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-700">Receipt Prefix</label>
                    <input
                      type="text"
                      value={branchPrefix}
                      onChange={(e) => setBranchPrefix(e.target.value.toUpperCase())}
                      placeholder={branchName ? suggestReceiptPrefix(branchName) : 'e.g. TKD-01'}
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500 font-mono"
                    />
                    <p className="text-xs text-slate-400">
                      Leave blank to auto-generate. Must be unique across branches.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-700">Branch Manager</label>
                    <input
                      type="text"
                      value={branchManager}
                      onChange={(e) => setBranchManager(e.target.value)}
                      placeholder="e.g. Ama Serwaa (Manager)"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500 font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Staff assignment */}
              <div className="space-y-3.5 pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-black uppercase tracking-wider text-slate-400">
                    2. Assign Staff to this Branch
                  </div>
                  <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
                    {branchStaffIds.length} selected
                  </span>
                </div>

                <div className="border border-slate-300 rounded-xl divide-y divide-slate-200 max-h-72 overflow-y-auto">
                  {users.map((u) => {
                    const checked = branchStaffIds.includes(u.id);
                    const currentBranchName =
                      u.outletId === 'all-outlets'
                        ? 'All Outlets (HQ)'
                        : outlets.find((o) => o.id === u.outletId)?.name || 'Unassigned';
                    return (
                      <label
                        key={u.id}
                        className="flex items-center gap-3.5 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleBranchStaff(u.id)}
                          className="w-4 h-4 accent-accent-500 rounded cursor-pointer shrink-0"
                        />
                        <img
                          src={u.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80'}
                          alt={u.fullName}
                          className="w-9 h-9 rounded-full object-cover border border-slate-300 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-slate-900 truncate">{u.fullName}</div>
                          <div className="text-xs text-slate-500 font-mono truncate mt-0.5">
                            @{u.username} • {rolesPermissions.find((r) => r.role === u.role)?.roleTitle || u.role}
                          </div>
                        </div>
                        <span className="text-xs text-slate-400 shrink-0 hidden sm:block">
                          Currently: {currentBranchName}
                        </span>
                      </label>
                    );
                  })}
                </div>

                <p className="text-xs text-slate-500">
                  Unticking a staff member who currently sits on this branch moves them back to the
                  All Outlets (HQ) scope — no account is deleted.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-5 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsBranchModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-accent-500 hover:bg-accent-600 text-white shadow-xs transition-colors cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingBranch ? 'Save Branch Changes' : 'Create Branch'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BRANCH STAFF ROSTER DRAWER */}
      {assignBranch && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-70 flex items-center justify-center p-4 sm:p-6 animate-modal-backdrop">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-300 animate-modal-card">
            <div className="p-5 sm:p-6 border-b border-slate-300 flex items-center justify-between bg-slate-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-100 text-accent-600 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-accent-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    Staff Roster — {assignBranch.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {staffCountForBranch(assignBranch.id)} assigned • {assignBranch.town}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAssignBranch(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 border-b border-slate-200 shrink-0 bg-white">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={assignSearch}
                  onChange={(e) => setAssignSearch(e.target.value)}
                  placeholder="Search staff by name or username..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500"
                />
              </div>
            </div>

            <div className="divide-y divide-slate-200 overflow-y-auto flex-1">
              {users
                .filter(
                  (u) =>
                    u.fullName.toLowerCase().includes(assignSearch.toLowerCase()) ||
                    u.username.toLowerCase().includes(assignSearch.toLowerCase())
                )
                .map((u) => {
                  const assignedHere = u.outletId === assignBranch.id;
                  return (
                    <div key={u.id} className="flex items-center gap-3.5 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                      <img
                        src={u.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80'}
                        alt={u.fullName}
                        className="w-10 h-10 rounded-full object-cover border border-slate-300 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-slate-900 truncate">{u.fullName}</div>
                        <div className="text-xs text-slate-500 font-mono truncate mt-0.5">
                          @{u.username} •{' '}
                          {u.outletId === 'all-outlets'
                            ? 'All Outlets (HQ)'
                            : outlets.find((o) => o.id === u.outletId)?.name || 'Unassigned'}
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          handleSetUserBranch(u.id, assignedHere ? 'all-outlets' : assignBranch.id)
                        }
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer shrink-0 ${
                          assignedHere
                            ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-300'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-300'
                        }`}
                      >
                        {assignedHere ? 'Release' : 'Assign here'}
                      </button>
                    </div>
                  );
                })}
            </div>

            <div className="p-4 sm:p-5 border-t border-slate-200 flex justify-end shrink-0 bg-slate-50">
              <button
                onClick={() => setAssignBranch(null)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 border border-slate-300 hover:bg-white transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT USER MODAL */}
      {isUserModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-70 flex items-center justify-center p-4 sm:p-6 animate-modal-backdrop">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-300 animate-modal-card flex flex-col max-h-[92vh]">
            <div className="p-5 sm:p-6 border-b border-slate-300 flex items-center justify-between bg-slate-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-100 text-accent-600 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-accent-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {editingUser ? 'Edit Staff Account' : 'Register New Staff Member'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Configure staff roles, branch assignments, and access credentials
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsUserModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-6 sm:p-8 space-y-5 overflow-y-auto flex-1">
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kwame Asante"
                  value={userFullName}
                  onChange={(e) => setUserFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700">Username</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. kasante"
                    value={userUsername}
                    onChange={(e) => setUserUsername(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700">4-Digit PIN Code</label>
                  <input
                    type="password"
                    maxLength={4}
                    required
                    value={userPin}
                    onChange={(e) => setUserPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3.5 py-2.5 text-sm text-center tracking-widest bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500 font-mono font-bold"
                  />
                  <p className="text-[11px] text-slate-500">For counter approvals and unlocking the till — not for signing in.</p>
                </div>
              </div>

              {/* FR-AUTH-07: how they get in the first time */}
              {!editingUser && (
                <div className="space-y-1.5 rounded-xl border border-slate-300 bg-slate-50 p-4">
                  <label className="text-sm font-bold text-slate-700">Temporary password</label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      required
                      minLength={8}
                      value={userPassword}
                      onChange={(e) => setUserPassword(e.target.value)}
                      className="flex-1 min-w-[12rem] px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-accent-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setUserPassword(generateSecureTempPassword())}
                      className="px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      Generate
                    </button>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(userPassword).catch(() => {})}
                      className="px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Give this to them in person. They sign in with it once and are asked to choose
                    their own password before they can do anything else — until then two people know
                    this one.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700">System Role</label>
                  <select
                    required
                    value={userRole}
                    onChange={(e) => setUserRole(e.target.value as UserRole | '')}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500 font-medium"
                  >
                    <option value="" disabled>Select role</option>
                    <option value="cashier">POS Cashier</option>
                    <option value="manager">Branch Manager</option>
                    <option value="storekeeper">Storekeeper / Inventory</option>
                    <option value="owner">Super Administrator</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700">Store Branch</label>
                  <select
                    required
                    value={userOutlet}
                    onChange={(e) => setUserOutlet(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500 font-medium"
                  >
                    <option value="" disabled>Select branch</option>
                    {outlets.map((o) => (
                      <option key={o.id} value={o.id} disabled={o.active === false}>
                        {o.name} ({o.town})
                        {o.active === false ? ' — deactivated' : ''}
                      </option>
                    ))}
                    <option value="all-outlets">All Outlets (HQ Enterprise)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700">Email Address</label>
                  <input
                    type="email"
                    placeholder="kwame@incohardware.com"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700">Phone Number</label>
                  <input
                    type="text"
                    placeholder="+233 24 000 0000"
                    value={userPhone}
                    onChange={(e) => setUserPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500"
                  />
                </div>
              </div>

              {/* Password & Next-Login Security Controls */}
              {editingUser ? (
                <div className="p-4 sm:p-5 bg-slate-50 border border-slate-300 rounded-xl space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                      <KeyRound className="w-4 h-4 text-accent-500" />
                      <span>Password &amp; Login Security Policy</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenResetPasswordModal(editingUser)}
                      className="px-3 py-1.5 text-xs font-bold bg-white text-accent-700 border border-accent-200 rounded-lg hover:bg-accent-50 cursor-pointer flex items-center gap-1.5 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-accent-600" />
                      <span>Reset Password...</span>
                    </button>
                  </div>

                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={userMustChangePassword}
                      onChange={(e) => setUserMustChangePassword(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-accent-600 focus:ring-accent-500 w-4 h-4"
                    />
                    <div>
                      <div className="text-sm font-bold text-slate-800">
                        Require password update on next login
                      </div>
                      <div className="text-xs text-slate-500 leading-normal mt-0.5">
                        Forces this user to establish new personal credentials immediately upon their next login attempt.
                      </div>
                    </div>
                  </label>

                  {editingUser.passwordResetAt && (
                    <div className="text-xs text-slate-500 flex items-center justify-between pt-2 border-t border-slate-300">
                      <span>Last reset executed:</span>
                      <span className="font-bold text-slate-700 font-mono">
                        {editingUser.passwordResetAt}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 sm:p-5 bg-slate-50 border border-slate-300 rounded-xl">
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={userMustChangePassword}
                      onChange={(e) => setUserMustChangePassword(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-accent-600 focus:ring-accent-500 w-4 h-4"
                    />
                    <div>
                      <div className="text-sm font-bold text-slate-800">
                        Require password change on first login
                      </div>
                      <div className="text-xs text-slate-500 leading-normal mt-0.5">
                        Recommended security standard: newly onboarded staff are prompted to personalize their credentials.
                      </div>
                    </div>
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-5 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={userSaving}
                  className="px-5 py-2.5 text-sm font-bold bg-accent-500 disabled:opacity-50 hover:bg-accent-600 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  {userSaving ? 'Saving…' : editingUser ? 'Save User Changes' : 'Create Staff User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD WORKFLOW MODAL */}
      {isResetPasswordModalOpen && targetUserForPasswordReset && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-70 flex items-center justify-center p-4 sm:p-6 animate-modal-backdrop">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-300 animate-modal-card flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-slate-300 flex items-center justify-between bg-gradient-to-r from-accent-50 to-amber-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-500 text-white flex items-center justify-center shadow-xs shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    Reset Staff Password
                  </h3>
                  <p className="text-xs text-slate-500">
                    Generate credentials &amp; configure login policy
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsResetPasswordModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-white/60 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
              {/* User Target Card */}
              <div className="flex items-center gap-3.5 p-4 bg-slate-50 rounded-xl border border-slate-300">
                <img
                  src={
                    targetUserForPasswordReset.avatarUrl ||
                    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80'
                  }
                  alt={targetUserForPasswordReset.fullName}
                  className="w-12 h-12 rounded-full object-cover border border-slate-300 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-bold text-slate-900 text-sm truncate">
                      {targetUserForPasswordReset.fullName}
                    </div>
                    <span className="text-xs font-mono text-slate-600 bg-slate-200/70 px-2 py-0.5 rounded">
                      @{targetUserForPasswordReset.username}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 truncate mt-0.5">
                    {targetUserForPasswordReset.email} • {targetUserForPasswordReset.phone}
                  </div>
                </div>
              </div>

              {/* Temporary Password Field */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-slate-800">
                    Temporary Credentials
                  </label>
                  <button
                    type="button"
                    onClick={() => setTempPasswordInput(generateSecureTempPassword())}
                    className="text-xs text-accent-600 hover:text-accent-700 font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Regenerate Secure Password</span>
                  </button>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="relative flex-1">
                    <input
                      type={showTempPassword ? 'text' : 'password'}
                      value={tempPasswordInput}
                      onChange={(e) => setTempPasswordInput(e.target.value)}
                      placeholder="Enter temporary password"
                      className="w-full pl-4 pr-12 py-3 text-sm font-mono font-bold tracking-wider bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTempPassword((prev) => !prev)}
                      className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      title={showTempPassword ? 'Hide password' : 'Show password'}
                    >
                      {showTempPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyTempPassword}
                    className={`px-4 py-3 rounded-xl text-sm font-bold border transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
                      copiedTempPassword
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300'
                    }`}
                    title="Copy password to clipboard"
                  >
                    {copiedTempPassword ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-slate-500" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Provide this temporary password to the team member for their initial entry.
                </p>
              </div>

              {/* State-Based Flag: Require Password Update on Next Login */}
              <div className="p-4 sm:p-5 bg-accent-50/70 border border-accent-200 rounded-xl space-y-2">
                <label className="flex items-start gap-3.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={mustChangeOnNextLogin}
                    onChange={(e) => setMustChangeOnNextLogin(e.target.checked)}
                    className="mt-0.5 rounded border-accent-300 text-accent-600 focus:ring-accent-500 w-4 h-4"
                  />
                  <div>
                    <div className="text-sm font-bold text-slate-900 flex items-center gap-2.5">
                      <span>Require password update on next login</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-accent-200 text-accent-800">
                        Enforced Policy
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      When enabled, the user will be blocked from accessing POS terminal functions until they establish a new confidential password immediately after entering this temporary credential.
                    </p>
                  </div>
                </label>
              </div>

              {/* Notification Simulation Checkbox */}
              <div className="p-4 bg-slate-50 border border-slate-300 rounded-xl">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={dispatchNotification}
                    onChange={(e) => setDispatchNotification(e.target.checked)}
                    className="rounded border-slate-300 text-accent-600 focus:ring-accent-500 w-4 h-4"
                  />
                  <div className="text-xs sm:text-sm text-slate-700">
                    <span className="font-bold">Dispatch notification alert</span> to{' '}
                    <span className="font-mono text-slate-900 font-bold">{targetUserForPasswordReset.email}</span>
                  </div>
                </label>
              </div>

              {/* Audit Trail Notice */}
              <div className="flex items-center gap-2.5 text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-300">
                <Shield className="w-4 h-4 text-slate-400 shrink-0" />
                <span>
                  This action will invalidate active sessions and be recorded in the enterprise Audit Log.
                </span>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-300 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsResetPasswordModalOpen(false)}
                className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200/70 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={userSaving}
                onClick={() => void handleConfirmPasswordReset()}
                className="px-5 py-2.5 text-sm font-bold bg-accent-500 hover:bg-accent-600 text-white rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-2"
              >
                <KeyRound className="w-4 h-4" />
                <span>Confirm Password Reset</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEXT-LOGIN PASSWORD CHANGE SIMULATION MODAL */}
      {isNextLoginPromptOpen && simulatedUserForLoginPrompt && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-70 flex items-center justify-center p-4 sm:p-6 animate-modal-backdrop">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-300 animate-modal-card flex flex-col max-h-[92vh]">
            <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-500 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight">
                    Password Update Required
                  </h3>
                  <span className="text-xs text-accent-200 font-mono">
                    Mandatory Next-Login Policy
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsNextLoginPromptOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCompleteNextLoginPasswordChange} className="p-6 sm:p-8 space-y-5 overflow-y-auto flex-1">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs sm:text-sm text-amber-900 space-y-1.5">
                <div className="font-bold flex items-center gap-2 text-amber-800">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  Security Notice for {simulatedUserForLoginPrompt.fullName}
                </div>
                <p className="text-xs text-amber-700 leading-relaxed">
                  Your system administrator reset your password and flagged your account to establish a confidential password on your next login.
                </p>
              </div>

              {simError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{simError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700">
                  Current / Temporary Password
                </label>
                <input
                  type="text"
                  required
                  value={simCurrentPass}
                  onChange={(e) => setSimCurrentPass(e.target.value)}
                  placeholder="Enter temporary password"
                  className="w-full px-4 py-2.5 text-sm font-mono bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700">
                  New Personal Password
                </label>
                <div className="relative">
                  <input
                    type={simShowPass ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={simNewPass}
                    onChange={(e) => setSimNewPass(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full pl-4 pr-12 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500"
                  />
                  <button
                    type="button"
                    onClick={() => setSimShowPass((p) => !p)}
                    className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {simShowPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700">
                  Confirm New Password
                </label>
                <input
                  type={simShowPass ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={simConfirmPass}
                  onChange={(e) => setSimConfirmPass(e.target.value)}
                  placeholder="Retype new password"
                  className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsNextLoginPromptOpen(false)}
                  className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-sm font-bold bg-slate-900 hover:bg-black text-white rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-2"
                >
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Update Password &amp; Clear Flag</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FR-USER-03 · BR-16: per-person grants, over and above the role. */}
      <UserPermissionsModal
        user={permissionsFor}
        roleCodes={
          rolesPermissions.find((entry) => entry.role === permissionsFor?.role)?.permissions || []
        }
        onClose={() => setPermissionsFor(null)}
        onSetPermission={async (code, granted) => {
          if (!permissionsFor) return;
          await onSetUserPermission(permissionsFor.id, code, granted);
          // Re-read the person from the refreshed list so the row shows what
          // the server stored, not what this screen asked for.
          setPermissionsFor((current) => (current
            ? users.find((person) => person.id === current.id) || current
            : current));
          onAddAuditLog({
            actor: 'Admin',
            action: 'USER_PERMISSION_CHANGED',
            entity: 'User',
            outletName: currentOutlet.name,
            details: `${code} ${granted === undefined ? 'cleared to role default' : granted ? 'granted' : 'withheld'} for ${permissionsFor.fullName || permissionsFor.username}`,
          });
        }}
      />
    </div>
  );
};
