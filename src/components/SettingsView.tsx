import React, { useState } from 'react';
import {
  Users,
  ShieldCheck,
  Key,
  Printer,
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
import { exportToCsv } from '../utils/csvExport';

interface SettingsViewProps {
  currentOutlet: Outlet;
  outlets: Outlet[];
  onAddOutlet: (outlet: Outlet) => void;
  onUpdateOutlet: (outletId: OutletId, changes: Partial<Outlet>) => void;
  currentUser: UserAccount;
  users: UserAccount[];
  onUpdateUsers: (users: UserAccount[]) => void;
  rolesPermissions: RolePermissions[];
  onUpdateRolesPermissions: (roles: RolePermissions[]) => void;
  generalSettings: GeneralSettings;
  onUpdateGeneralSettings: (settings: GeneralSettings) => void;
  onAddAuditLog: (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => void;
  products: Product[];
  sales: CompletedSale[];
  accentColor: string;
  onChangeAccent: (color: string) => void;
}

type SettingsTab =
  | 'general'
  | 'outlets'
  | 'users'
  | 'permissions'
  | 'security'
  | 'printers'
  | 'appearance'
  | 'backup';

const SETTINGS_TABS: {
  key: SettingsTab;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: 'general', label: 'Store Profile', hint: 'Legal identity, TIN, currency & rounding', icon: Building },
  { key: 'outlets', label: 'Stores & Branches', hint: 'Register branches & assign staff', icon: Store },
  { key: 'users', label: 'User Accounts', hint: 'Staff credentials & branches', icon: Users },
  { key: 'permissions', label: 'Roles & Permissions', hint: 'RBAC matrix & capabilities', icon: ShieldCheck },
  { key: 'security', label: 'Manager PIN', hint: 'Floor price & void override policies', icon: Key },
  { key: 'printers', label: 'Hardware & Receipts', hint: '80mm / 58mm thermal templates', icon: Printer },
  { key: 'appearance', label: 'Theme', hint: 'Accent colour & visual palette', icon: Palette },
  { key: 'backup', label: 'Backup', hint: 'JSON archive & accounting CSV exports', icon: Database },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentOutlet,
  outlets,
  onAddOutlet,
  onUpdateOutlet,
  currentUser,
  users,
  onUpdateUsers,
  rolesPermissions,
  onUpdateRolesPermissions,
  generalSettings,
  onUpdateGeneralSettings,
  onAddAuditLog,
  products,
  sales,
  accentColor,
  onChangeAccent,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // General Store Settings State
  const [companyName, setCompanyName] = useState(generalSettings.companyName);
  const [taxRegNo, setTaxRegNo] = useState(generalSettings.taxRegistrationNumber);
  const [taxEnabled, setTaxEnabled] = useState(generalSettings.taxEnabled);
  const [taxRate, setTaxRate] = useState(generalSettings.taxRatePercent);
  const [currencySymbol, setCurrencySymbol] = useState(generalSettings.currencySymbol);
  const [cashRounding, setCashRounding] = useState(generalSettings.cashRounding);

  // Security & PIN State
  const [managerPin, setManagerPin] = useState(generalSettings.managerPin);
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
  const [userRole, setUserRole] = useState<UserRole>('cashier');
  const [userOutlet, setUserOutlet] = useState<OutletId>('inco-hardware');
  const [userPin, setUserPin] = useState('1234');
  const [userMustChangePassword, setUserMustChangePassword] = useState(false);

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

  // Handle saving security settings
  const handleSaveSecurity = () => {
    if (!/^\d{4}$/.test(managerPin)) {
      alert('Manager PIN must be exactly 4 numeric digits.');
      return;
    }
    const updated: GeneralSettings = {
      ...generalSettings,
      managerPin,
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
      details: `Updated Master Manager PIN & security policies (Floor PIN: ${enforceFloorPin}, Void PIN: ${enforceVoidPin}, Blind Shift: ${enforceBlindShift})`,
    });
    showToast('Security and Manager PIN policies updated successfully.');
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

  // Derive a receipt prefix like "RAD-01" from the branch name when left blank.
  const suggestReceiptPrefix = (name: string) => {
    const letters = name.replace(/[^a-zA-Z]/g, '').toUpperCase();
    const stem = (letters.slice(0, 3) || 'BRN').padEnd(3, 'X');
    let index = 1;
    let candidate = `${stem}-01`;
    while (outlets.some((o) => o.receiptPrefix.toUpperCase() === candidate)) {
      index += 1;
      candidate = `${stem}-${String(index).padStart(2, '0')}`;
    }
    return candidate;
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
    setUserRole('cashier');
    setUserOutlet(currentOutlet.id === 'all-outlets' ? outlets[0]?.id || 'all-outlets' : currentOutlet.id);
    setUserPin('1234');
    setUserMustChangePassword(true); // default new users to requiring password change on first login
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
    setUserPin(u.pinCode || '1234');
    setUserMustChangePassword(!!u.mustChangePasswordOnNextLogin);
    setIsUserModalOpen(true);
  };

  // Generate secure readable temporary password
  const generateSecureTempPassword = () => {
    const prefixes = ['Dreams', 'Apex', 'Inco', 'Kumasi', 'SafeVault', 'VoltSafe', 'Terminal'];
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
  const handleConfirmPasswordReset = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!targetUserForPasswordReset) return;

    if (tempPasswordInput.trim().length < 6) {
      alert('Temporary password must contain at least 6 characters.');
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

    onUpdateUsers(updated);

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
    setSimCurrentPass(u.tempPassword || 'Dreams#2026');
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

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFullName.trim() || !userUsername.trim()) {
      alert('Please fill in required fields (Name and Username).');
      return;
    }
    if (!/^\d{4}$/.test(userPin)) {
      alert('PIN must be exactly 4 numeric digits.');
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
      onUpdateUsers(updated);
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
        lastLogin: 'Never',
        avatarUrl: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80`,
        mustChangePasswordOnNextLogin: userMustChangePassword,
      };
      onUpdateUsers([newUser, ...users]);
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
  const handleTogglePermission = (
    roleKey: UserRole,
    permKey: keyof RolePermissions['permissions']
  ) => {
    setEditableRoles((prev) =>
      prev.map((r) => {
        if (r.role === roleKey) {
          return {
            ...r,
            permissions: {
              ...r.permissions,
              [permKey]: !r.permissions[permKey],
            },
          };
        }
        return r;
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

  // Export full JSON database
  const handleExportFullBackup = () => {
    const backupData = {
      system: 'DreamsPOS',
      version: '2.6',
      exportedAt: new Date().toISOString(),
      activeOutlet: currentOutlet,
      settings: generalSettings,
      users: users.map(({ pinCode, ...rest }) => rest), // sanitized
      rolesPermissions,
      totalProducts: products.length,
      totalSales: sales.length,
      products,
      sales,
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `dreamspos_full_backup_${new Date().toISOString().slice(0, 10)}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    onAddAuditLog({
      actor: 'Admin',
      action: 'SYSTEM_BACKUP_EXPORT',
      entity: 'System Data',
      outletName: currentOutlet.name,
      details: 'Generated complete system JSON backup archive with products, sales, and configuration',
    });
    showToast('Full system backup archive exported.');
  };

  const swatches = [
    { label: 'Orange (Default)', hex: '#c55200' },
    { label: 'Amber', hex: '#a56800' },
    { label: 'Crimson', hex: '#c1354b' },
    { label: 'Plum', hex: '#8b4a99' },
    { label: 'Forest', hex: '#2d7a4f' },
    { label: 'Teal', hex: '#10786f' },
    { label: 'Graphite', hex: '#57534e' },
  ];

  const currentRoleConfig =
    editableRoles.find((r) => r.role === selectedRoleForEdit) || editableRoles[0];

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
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              Enterprise System Settings
            </h1>
            <span className="text-[10px] font-black uppercase bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full border border-slate-300">
              v2.6 Certified
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Manage store profiles, user credentials, role permissions, master security policies,
            and thermal receipt hardware.
          </p>
        </div>
      </div>

      {/* Module Tabs — aligned horizontally across the top of the page */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-2xs p-1.5">
        <div className="flex flex-wrap items-stretch gap-1">
          {SETTINGS_TABS.map(({ key, label, hint, icon: Icon }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
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
          {activeTab === 'general' && (
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
                  className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
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
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500 font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">GRA Tax Registration Number (TIN)</label>
                  <input
                    type="text"
                    value={taxRegNo}
                    onChange={(e) => setTaxRegNo(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Primary Currency Symbol &amp; Code</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={currencySymbol}
                      onChange={(e) => setCurrencySymbol(e.target.value)}
                      className="w-24 px-3.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500 font-bold text-center"
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
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500"
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
                    className="w-5 h-5 accent-orange-500 rounded cursor-pointer"
                  />
                </div>

                {taxEnabled && (
                  <div className="p-4 bg-orange-50/60 border border-orange-200 rounded-xl flex items-center gap-4">
                    <div className="space-y-1 flex-1">
                      <label className="text-xs font-bold text-orange-950">Combined Tax Rate (%)</label>
                      <p className="text-[11px] text-orange-800">Standard rate for Ghana commercial sales is 21.9%.</p>
                    </div>
                    <div className="w-32 flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-orange-300">
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
                    className="text-[11px] font-bold text-orange-600 hover:text-orange-700 underline cursor-pointer"
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
                          <span className="text-[10px] font-mono font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
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
          {activeTab === 'outlets' && (
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
                  className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
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
                              <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-200 text-orange-600 flex items-center justify-center shrink-0">
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
          {activeTab === 'users' && (
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
                  className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
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
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500"
                  />
                </div>
                <select
                  value={userOutletFilter}
                  onChange={(e) => setUserOutletFilter(e.target.value)}
                  className="px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500 font-medium"
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
                                  ? 'Head Office'
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
                                className="inline-flex items-center justify-center p-1.5 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-300 transition-colors cursor-pointer"
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
          {activeTab === 'permissions' && (
            <div className="bg-white rounded-xl border border-slate-300 p-6 shadow-2xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Role-Based Access Control (RBAC) &amp; Permissions
                  </h2>
                  <p className="text-xs text-slate-500">
                    Configure granular capabilities for Super Admins, Branch Managers, Cashiers, and Storekeepers.
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
                    className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
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
              </div>

              {/* Permissions Matrix Checklist Groups */}
              <div className="space-y-5">
                {/* Group 1: Point of Sale & Cashiering */}
                <div className="space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Point of Sale &amp; Register Operations
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-300 hover:border-orange-200 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={currentRoleConfig.permissions.canOpenTerminal}
                        onChange={() =>
                          handleTogglePermission(selectedRoleForEdit, 'canOpenTerminal')
                        }
                        className="w-4 h-4 mt-0.5 accent-orange-500 rounded cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-800">Launch POS Terminal</div>
                        <div className="text-[11px] text-slate-500">Access register checkout screen &amp; scan barcodes</div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-300 hover:border-orange-200 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={currentRoleConfig.permissions.canApplyDiscount}
                        onChange={() =>
                          handleTogglePermission(selectedRoleForEdit, 'canApplyDiscount')
                        }
                        className="w-4 h-4 mt-0.5 accent-orange-500 rounded cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-800">Apply Discounts</div>
                        <div className="text-[11px] text-slate-500">Apply percentage or fixed price markdowns</div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-300 hover:border-orange-200 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={currentRoleConfig.permissions.canOverrideFloorPrice}
                        onChange={() =>
                          handleTogglePermission(selectedRoleForEdit, 'canOverrideFloorPrice')
                        }
                        className="w-4 h-4 mt-0.5 accent-orange-500 rounded cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-800">Override Floor Price</div>
                        <div className="text-[11px] text-slate-500">Sell below floor price threshold without manager prompt</div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-300 hover:border-orange-200 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={currentRoleConfig.permissions.canVoidSale}
                        onChange={() =>
                          handleTogglePermission(selectedRoleForEdit, 'canVoidSale')
                        }
                        className="w-4 h-4 mt-0.5 accent-orange-500 rounded cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-800">Void Completed Sales</div>
                        <div className="text-[11px] text-slate-500">Cancel immutable receipts and restore inventory</div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-300 hover:border-orange-200 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={currentRoleConfig.permissions.canBlindCloseShift}
                        onChange={() =>
                          handleTogglePermission(selectedRoleForEdit, 'canBlindCloseShift')
                        }
                        className="w-4 h-4 mt-0.5 accent-orange-500 rounded cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-800">Shift Drawer Close</div>
                        <div className="text-[11px] text-slate-500">Submit blind physical cash drawer counts</div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Group 2: Inventory & Catalog */}
                <div className="space-y-3 pt-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Inventory &amp; Cost Pricing
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-300 hover:border-orange-200 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={currentRoleConfig.permissions.canViewCostPrices}
                        onChange={() =>
                          handleTogglePermission(selectedRoleForEdit, 'canViewCostPrices')
                        }
                        className="w-4 h-4 mt-0.5 accent-orange-500 rounded cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-800">View Unit Cost Prices</div>
                        <div className="text-[11px] text-slate-500">Inspect weighted average cost and margin analytics</div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-300 hover:border-orange-200 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={currentRoleConfig.permissions.canAddProducts}
                        onChange={() =>
                          handleTogglePermission(selectedRoleForEdit, 'canAddProducts')
                        }
                        className="w-4 h-4 mt-0.5 accent-orange-500 rounded cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-800">Create &amp; Edit Catalog Products</div>
                        <div className="text-[11px] text-slate-500">Add SKUs, units of measure, and specifications</div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-300 hover:border-orange-200 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={currentRoleConfig.permissions.canAdjustStock}
                        onChange={() =>
                          handleTogglePermission(selectedRoleForEdit, 'canAdjustStock')
                        }
                        className="w-4 h-4 mt-0.5 accent-orange-500 rounded cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-800">Manual Stock Adjustment (FR-STK-07)</div>
                        <div className="text-[11px] text-slate-500">Log damage, shrinkage, and audit discrepancies</div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-300 hover:border-orange-200 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={currentRoleConfig.permissions.canReceiveGoods}
                        onChange={() =>
                          handleTogglePermission(selectedRoleForEdit, 'canReceiveGoods')
                        }
                        className="w-4 h-4 mt-0.5 accent-orange-500 rounded cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-800">Receive Goods (GRN BR-4)</div>
                        <div className="text-[11px] text-slate-500">Process purchase orders &amp; recalculate weighted cost</div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Group 3: Reports & System Administration */}
                <div className="space-y-3 pt-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Reports &amp; System Administration
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-300 hover:border-orange-200 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={currentRoleConfig.permissions.canViewExecutiveReports}
                        onChange={() =>
                          handleTogglePermission(selectedRoleForEdit, 'canViewExecutiveReports')
                        }
                        className="w-4 h-4 mt-0.5 accent-orange-500 rounded cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-800">Executive Profit Dashboards</div>
                        <div className="text-[11px] text-slate-500">Inspect gross profit margins and store comparisons</div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-300 hover:border-orange-200 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={currentRoleConfig.permissions.canExportCsv}
                        onChange={() =>
                          handleTogglePermission(selectedRoleForEdit, 'canExportCsv')
                        }
                        className="w-4 h-4 mt-0.5 accent-orange-500 rounded cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-800">Export Accounting CSVs</div>
                        <div className="text-[11px] text-slate-500">Download data for QuickBooks, Sage, Xero, and Excel</div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-300 hover:border-orange-200 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={currentRoleConfig.permissions.canViewAuditLogs}
                        onChange={() =>
                          handleTogglePermission(selectedRoleForEdit, 'canViewAuditLogs')
                        }
                        className="w-4 h-4 mt-0.5 accent-orange-500 rounded cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-800">Inspect Security Audit Trail</div>
                        <div className="text-[11px] text-slate-500">Review forensic user activity and authorization logs</div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-300 hover:border-orange-200 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={currentRoleConfig.permissions.canModifySystemSettings}
                        onChange={() =>
                          handleTogglePermission(selectedRoleForEdit, 'canModifySystemSettings')
                        }
                        className="w-4 h-4 mt-0.5 accent-orange-500 rounded cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-800">Modify System Settings</div>
                        <div className="text-[11px] text-slate-500">Change master PIN, store profile, and printer settings</div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SECURITY & MANAGER PIN */}
          {activeTab === 'security' && (
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
                  className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Update Security</span>
                </button>
              </div>

              {/* Master PIN Configuration */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-300 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-orange-500" />
                      Master Manager Authorization PIN
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Required for cashiers to execute floor price overrides and sale voids.
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 max-w-sm">
                  <div className="relative flex-1">
                    <input
                      type={showPin ? 'text' : 'password'}
                      maxLength={4}
                      value={managerPin}
                      onChange={(e) => setManagerPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-4 py-2.5 text-center tracking-[0.5em] font-mono text-lg font-black bg-white border border-slate-300 rounded-xl focus:outline-orange-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">4 digits</span>
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
                      className="w-5 h-5 accent-orange-500 rounded cursor-pointer"
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
                      className="w-5 h-5 accent-orange-500 rounded cursor-pointer"
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
                      className="w-5 h-5 accent-orange-500 rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: HARDWARE & RECEIPTS */}
          {activeTab === 'printers' && (
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
                  className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
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
                            ? 'border-orange-500 bg-orange-50/50 text-orange-700'
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
                            ? 'border-orange-500 bg-orange-50/50 text-orange-700'
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
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Receipt Footer Return Policy</label>
                    <textarea
                      rows={2}
                      value={receiptFooter}
                      onChange={(e) => setReceiptFooter(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500"
                    />
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-300">
                      <span className="text-xs font-bold text-slate-800">Auto-Print on Completed Sale</span>
                      <input
                        type="checkbox"
                        checked={autoPrint}
                        onChange={(e) => setAutoPrint(e.target.checked)}
                        className="w-4 h-4 accent-orange-500 rounded cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-300">
                      <span className="text-xs font-bold text-slate-800">Print Cashier Name &amp; Terminal Tag</span>
                      <input
                        type="checkbox"
                        checked={showCashier}
                        onChange={(e) => setShowCashier(e.target.checked)}
                        className="w-4 h-4 accent-orange-500 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* Live Receipt Mockup Preview */}
                <div className="lg:col-span-5 bg-slate-100 p-4 rounded-xl border border-slate-300 flex flex-col items-center">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Live Thermal Preview ({printerWidth})
                  </div>
                  <div
                    className={`bg-white shadow-md p-4 rounded-md border border-slate-300 font-mono text-[11px] text-slate-800 space-y-2 ${
                      printerWidth === '80mm' ? 'w-64' : 'w-52'
                    }`}
                  >
                    <div className="text-center font-bold pb-1 border-b border-dashed border-slate-300">
                      <div className="text-xs font-black">{generalSettings.companyName}</div>
                      <div className="text-[10px] text-slate-500">{currentOutlet.name}</div>
                      <div className="text-[9px] text-slate-400">{receiptHeader}</div>
                    </div>

                    <div className="text-[10px] space-y-0.5">
                      <div className="flex justify-between">
                        <span>RCPT:</span>
                        <span className="font-bold">{currentOutlet.receiptPrefix}-004312</span>
                      </div>
                      <div className="flex justify-between">
                        <span>DATE:</span>
                        <span>05/09/2026 11:30</span>
                      </div>
                      {showCashier && (
                        <div className="flex justify-between">
                          <span>CASHIER:</span>
                          <span>Kwame A.</span>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-b border-dashed border-slate-300 py-1.5 space-y-1 text-[10px]">
                      <div className="flex justify-between font-bold">
                        <span>ITEM</span>
                        <span>TOTAL</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>1x Ingco 850W Drill</span>
                        <span>650.00</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>2x PVC Pressure Pipe</span>
                        <span>160.00</span>
                      </div>
                    </div>

                    <div className="space-y-0.5 text-[10px] pt-1">
                      <div className="flex justify-between font-black text-xs">
                        <span>TOTAL:</span>
                        <span>GH₵ 810.00</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>PAID (MOMO):</span>
                        <span>GH₵ 810.00</span>
                      </div>
                    </div>

                    <div className="text-center text-[9px] text-slate-400 pt-2 border-t border-dashed border-slate-300">
                      {receiptFooter}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: APPEARANCE & THEME */}
          {activeTab === 'appearance' && (
            <div className="bg-white rounded-xl border border-slate-300 p-6 shadow-2xs space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Visual Personalization &amp; Themes</h2>
                  <p className="text-xs text-slate-500">
                    Customize your system accent color tokens and active visual branding across the workspace.
                  </p>
                </div>
                <button
                  onClick={() => onChangeAccent('#ff9f43')}
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
                      placeholder="#ff9f43"
                      className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500"
                    />
                    <button
                      onClick={() => {
                        if (/^#[0-9A-F]{6}$/i.test(customHex)) {
                          const clean = customHex.replace('#', '');
                          const r = parseInt(clean.substring(0, 2), 16);
                          const g = parseInt(clean.substring(2, 4), 16);
                          const b = parseInt(clean.substring(4, 6), 16);
                          if (b > r + 30 && b > g + 15) {
                            alert('Blue is refused as an accent color per design system rules (AC-11). Please choose Orange, Amber, Crimson, Plum, Forest, Teal, or Graphite.');
                            return;
                          }
                          onChangeAccent(customHex);
                          showToast('Custom accent color applied.');
                        } else {
                          alert('Please enter a valid 6-digit hex code, e.g. #c55200');
                        }
                      }}
                      className="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>
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
          {activeTab === 'backup' && (
            <div className="bg-white rounded-xl border border-slate-300 p-6 shadow-2xs space-y-6">
              <div className="pb-4 border-b border-slate-200">
                <h2 className="text-base font-bold text-slate-900">
                  Data Backup &amp; External Accounting Integration
                </h2>
                <p className="text-xs text-slate-500">
                  Safeguard complete business data archives and synchronize transactions with your accounting software.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Full System JSON Backup */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-300 space-y-3 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                      <Database className="w-4 h-4 text-orange-500" />
                      Full System Snapshot (JSON)
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Creates a portable JSON archive with all products, inventory, sales, user accounts, and configuration.
                    </p>
                  </div>
                  <button
                    onClick={handleExportFullBackup}
                    className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-black text-white px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Full Backup (.JSON)</span>
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
                      Format-standardized with UTF-8 BOM encoding for QuickBooks, Sage, Xero, and Microsoft Excel.
                    </p>
                  </div>
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
                          s.timestamp,
                          s.outletName,
                          s.cashierName,
                          s.customerName,
                          s.paymentMethod,
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
                    <span className="font-bold text-slate-800">DreamsPOS v2.6 Certified</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Active Store Outlets:</span>
                    <span className="font-bold text-slate-800">{outlets.length} Branches</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Offline Cache:</span>
                    <span className="font-bold text-emerald-600">IndexedDB Synced</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Catalog SKUs:</span>
                    <span className="font-bold text-slate-800">{products.length} Products</span>
                  </div>
                </div>
              </div>
            </div>
          )}
      </div>

      {/* SET UP / EDIT STORE BRANCH MODAL */}
      {isBranchModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-70 flex items-center justify-center p-4 sm:p-6 animate-modal-backdrop">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-300 animate-modal-card">
            <div className="p-5 sm:p-6 border-b border-slate-300 flex items-center justify-between bg-slate-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                  <Store className="w-5 h-5 text-orange-600" />
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
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500 font-medium"
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
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500 font-medium"
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
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500 font-medium"
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
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-700">Receipt Prefix</label>
                    <input
                      type="text"
                      value={branchPrefix}
                      onChange={(e) => setBranchPrefix(e.target.value.toUpperCase())}
                      placeholder={branchName ? suggestReceiptPrefix(branchName) : 'e.g. TKD-01'}
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500 font-mono"
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
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500 font-medium"
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
                          className="w-4 h-4 accent-orange-500 rounded cursor-pointer shrink-0"
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
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-orange-500 hover:bg-orange-600 text-white shadow-xs transition-colors cursor-pointer"
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
                <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-orange-600" />
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
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500"
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
                <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-orange-600" />
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
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500"
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
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500 font-mono"
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
                    className="w-full px-3.5 py-2.5 text-sm text-center tracking-widest bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700">System Role</label>
                  <select
                    value={userRole}
                    onChange={(e) => setUserRole(e.target.value as UserRole)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500 font-medium"
                  >
                    <option value="cashier">POS Cashier</option>
                    <option value="branch_manager">Branch Manager</option>
                    <option value="storekeeper">Storekeeper / Inventory</option>
                    <option value="super_admin">Super Administrator</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700">Store Branch</label>
                  <select
                    value={userOutlet}
                    onChange={(e) => setUserOutlet(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500 font-medium"
                  >
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
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700">Phone Number</label>
                  <input
                    type="text"
                    placeholder="+233 24 000 0000"
                    value={userPhone}
                    onChange={(e) => setUserPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500"
                  />
                </div>
              </div>

              {/* Password & Next-Login Security Controls */}
              {editingUser ? (
                <div className="p-4 sm:p-5 bg-slate-50 border border-slate-300 rounded-xl space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                      <KeyRound className="w-4 h-4 text-orange-500" />
                      <span>Password &amp; Login Security Policy</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenResetPasswordModal(editingUser)}
                      className="px-3 py-1.5 text-xs font-bold bg-white text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-50 cursor-pointer flex items-center gap-1.5 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-orange-600" />
                      <span>Reset Password...</span>
                    </button>
                  </div>

                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={userMustChangePassword}
                      onChange={(e) => setUserMustChangePassword(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-orange-600 focus:ring-orange-500 w-4 h-4"
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
                      className="mt-0.5 rounded border-slate-300 text-orange-600 focus:ring-orange-500 w-4 h-4"
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
                  className="px-5 py-2.5 text-sm font-bold bg-orange-500 hover:bg-orange-600 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  {editingUser ? 'Save User Changes' : 'Create Staff User'}
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
            <div className="p-5 sm:p-6 border-b border-slate-300 flex items-center justify-between bg-gradient-to-r from-orange-50 to-amber-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-xs shrink-0">
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
                    className="text-xs text-orange-600 hover:text-orange-700 font-bold flex items-center gap-1.5 cursor-pointer"
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
                      className="w-full pl-4 pr-12 py-3 text-sm font-mono font-bold tracking-wider bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500"
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
              <div className="p-4 sm:p-5 bg-orange-50/70 border border-orange-200 rounded-xl space-y-2">
                <label className="flex items-start gap-3.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={mustChangeOnNextLogin}
                    onChange={(e) => setMustChangeOnNextLogin(e.target.checked)}
                    className="mt-0.5 rounded border-orange-300 text-orange-600 focus:ring-orange-500 w-4 h-4"
                  />
                  <div>
                    <div className="text-sm font-bold text-slate-900 flex items-center gap-2.5">
                      <span>Require password update on next login</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-orange-200 text-orange-800">
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
                    className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 w-4 h-4"
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
                onClick={() => handleConfirmPasswordReset()}
                className="px-5 py-2.5 text-sm font-bold bg-orange-500 hover:bg-orange-600 text-white rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-2"
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
                <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight">
                    Password Update Required
                  </h3>
                  <span className="text-xs text-orange-200 font-mono">
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
                  className="w-full px-4 py-2.5 text-sm font-mono bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500"
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
                    className="w-full pl-4 pr-12 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500"
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
                  className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-orange-500"
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
    </div>
  );
};
