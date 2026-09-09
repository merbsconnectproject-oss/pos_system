import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  DollarSign,
  Search,
  Filter,
  Plus,
  Printer,
  ChevronDown,
  ChevronRight,
  User,
  Phone,
  Tag,
  Receipt,
  Download,
  Wallet,
  CreditCard,
  Building,
  Sparkles,
  Layers,
  ArrowRight,
} from 'lucide-react';
import {
  CustomerInstallmentPlan,
  InstallmentScheduleItem,
  Customer,
  Product,
  Outlet,
  PaymentMethod,
} from '../types';
import { exportToCsv } from '../utils/csvExport';

interface InstallmentsViewProps {
  plans?: CustomerInstallmentPlan[];
  installmentPlans?: CustomerInstallmentPlan[];
  onAddPlan: (plan: CustomerInstallmentPlan) => void;
  onUpdatePlan: (updatedPlan: CustomerInstallmentPlan) => void;
  customers?: Customer[];
  products?: Product[];
  currentOutlet: Outlet;
  outlets: Outlet[];
  accentColor?: string;
}

export const InstallmentsView: React.FC<InstallmentsViewProps> = ({
  plans: propPlans,
  installmentPlans,
  onAddPlan,
  onUpdatePlan,
  customers = [],
  products = [],
  currentOutlet,
  outlets,
  accentColor,
}) => {
  const plans = propPlans || installmentPlans || [];
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'OVERDUE' | 'COMPLETED'>('ALL');
  const [outletFilter, setOutletFilter] = useState<string>(
    currentOutlet?.id === 'all-outlets' ? 'all' : (currentOutlet?.id || 'all')
  );
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(plans[0]?.id || null);

  // New Plan Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id || '');
  const [planOutletId, setPlanOutletId] = useState<string>(
    currentOutlet.id === 'all-outlets' ? 'radiance-lighting' : currentOutlet.id
  );
  const [planFrequency, setPlanFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>('monthly');
  const [planInstallmentCount, setPlanInstallmentCount] = useState<number>(3);
  const [planDownPayment, setPlanDownPayment] = useState<string>('1500');
  const [planNotes, setPlanNotes] = useState('');
  const [planSelectedItems, setPlanSelectedItems] = useState<
    Array<{ productId: string; quantity: number; unitPrice: number }>
  >([
    {
      productId: products.find((p) => p.outletId === 'radiance-lighting')?.id || products[0]?.id || '',
      quantity: 2,
      unitPrice: products.find((p) => p.outletId === 'radiance-lighting')?.retailPrice || 350,
    },
  ]);

  // Payment Recording Modal State
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [activePlanForPayment, setActivePlanForPayment] = useState<CustomerInstallmentPlan | null>(null);
  const [selectedInstallmentNum, setSelectedInstallmentNum] = useState<number>(1);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('momo');
  const [paymentReference, setPaymentReference] = useState('');

  // Receipt Slip Modal
  const [paymentReceiptSlip, setPaymentReceiptSlip] = useState<{
    plan: CustomerInstallmentPlan;
    installmentNum: number;
    amountPaid: number;
    method: string;
    reference: string;
    date: string;
    receiptNumber: string;
    newBalance: number;
  } | null>(null);

  // Calculate Overdue & Filtered Plans
  const processedPlans = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return plans.map((p) => {
      const hasOverdue = p.schedule.some(
        (s) => s.status === 'OVERDUE' || (s.status === 'PENDING' && s.dueDate < today)
      );
      return {
        ...p,
        isOverdue: hasOverdue && p.status === 'ACTIVE',
      };
    });
  }, [plans]);

  const filteredPlans = useMemo(() => {
    return processedPlans.filter((p) => {
      const matchesOutlet = outletFilter === 'all' || p.outletId === outletFilter;
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && p.status === 'ACTIVE') ||
        (statusFilter === 'COMPLETED' && p.status === 'COMPLETED') ||
        (statusFilter === 'OVERDUE' && p.isOverdue);
      const matchesSearch =
        p.planNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.customerPhone.includes(searchTerm);
      return matchesOutlet && matchesStatus && matchesSearch;
    });
  }, [processedPlans, outletFilter, statusFilter, searchTerm]);

  // Aggregate Metrics
  const totalBookValue = useMemo(() => plans.reduce((s, p) => s + p.totalAmount, 0), [plans]);
  const totalBalanceDue = useMemo(
    () => plans.filter((p) => p.status === 'ACTIVE').reduce((s, p) => s + p.remainingBalance, 0),
    [plans]
  );
  const totalCollected = totalBookValue - totalBalanceDue;
  const overdueCount = useMemo(() => processedPlans.filter((p) => p.isOverdue).length, [processedPlans]);
  const activePlansCount = useMemo(() => plans.filter((p) => p.status === 'ACTIVE').length, [plans]);

  // Handle Opening Payment Modal
  const handleOpenPayment = (plan: CustomerInstallmentPlan, installmentNum?: number) => {
    setActivePlanForPayment(plan);
    const targetItem =
      installmentNum !== undefined
        ? plan.schedule.find((s) => s.installmentNumber === installmentNum)
        : plan.schedule.find((s) => s.status !== 'PAID') || plan.schedule[0];

    setSelectedInstallmentNum(targetItem ? targetItem.installmentNumber : 1);
    setPaymentAmount(
      targetItem ? (targetItem.expectedAmount - targetItem.paidAmount).toString() : '500'
    );
    setPaymentReference(`MOM-${Math.floor(1000000 + Math.random() * 9000000)}`);
    setPaymentModalOpen(true);
  };

  // Submit Installment Payment
  const handleSubmitPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePlanForPayment || !paymentAmount || parseFloat(paymentAmount) <= 0) return;

    const amount = parseFloat(paymentAmount);
    const receiptNum = `RAD-INST-${activePlanForPayment.planNumber.replace('INST-', '')}-${selectedInstallmentNum}`;
    const today = new Date().toISOString().slice(0, 10);

    const updatedSchedule: InstallmentScheduleItem[] = activePlanForPayment.schedule.map((item) => {
      if (item.installmentNumber === selectedInstallmentNum) {
        const newPaid = item.paidAmount + amount;
        return {
          ...item,
          paidAmount: newPaid,
          paidDate: today,
          paymentMethod: paymentMethod,
          reference: paymentReference,
          status: newPaid >= item.expectedAmount ? 'PAID' : 'PARTIAL',
          receiptNumber: receiptNum,
        };
      }
      return item;
    });

    const newRemainingBalance = Math.max(0, activePlanForPayment.remainingBalance - amount);
    const allPaid = updatedSchedule.every((s) => s.status === 'PAID') || newRemainingBalance <= 0;

    const updatedPlan: CustomerInstallmentPlan = {
      ...activePlanForPayment,
      remainingBalance: newRemainingBalance,
      status: allPaid ? 'COMPLETED' : activePlanForPayment.status,
      schedule: updatedSchedule,
    };

    onUpdatePlan(updatedPlan);
    setPaymentModalOpen(false);

    // Open Printable Receipt Slip
    setPaymentReceiptSlip({
      plan: activePlanForPayment,
      installmentNum: selectedInstallmentNum,
      amountPaid: amount,
      method: paymentMethod.toUpperCase(),
      reference: paymentReference,
      date: new Date().toLocaleString('en-GB'),
      receiptNumber: receiptNum,
      newBalance: newRemainingBalance,
    });
  };

  // Create New Plan Submit
  const handleCreatePlanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cust = customers.find((c) => c.id === selectedCustomerId) || customers[0];
    const outlet = outlets.find((o) => o.id === planOutletId) || outlets[0];

    // Compute items
    const lineItems = planSelectedItems.map((item) => {
      const prod = products.find((p) => p.id === item.productId);
      return {
        productId: item.productId,
        productName: prod ? prod.name : 'Radiance Lighting Luminaire',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.quantity * item.unitPrice,
      };
    });

    const totalOrder = lineItems.reduce((s, i) => s + i.lineTotal, 0);
    const downPay = Math.min(parseFloat(planDownPayment) || 0, totalOrder);
    const balanceToFinance = Math.max(0, totalOrder - downPay);
    const perInstallment = balanceToFinance / planInstallmentCount;

    // Generate schedule
    const schedule: InstallmentScheduleItem[] = [];
    const now = new Date();
    for (let i = 1; i <= planInstallmentCount; i++) {
      const dueDateObj = new Date(now);
      if (planFrequency === 'weekly') {
        dueDateObj.setDate(now.getDate() + i * 7);
      } else if (planFrequency === 'biweekly') {
        dueDateObj.setDate(now.getDate() + i * 14);
      } else {
        dueDateObj.setMonth(now.getMonth() + i);
      }

      schedule.push({
        installmentNumber: i,
        dueDate: dueDateObj.toISOString().slice(0, 10),
        expectedAmount: parseFloat(perInstallment.toFixed(2)),
        paidAmount: 0,
        status: 'PENDING',
      });
    }

    const newPlan: CustomerInstallmentPlan = {
      id: `inst-${Date.now()}`,
      planNumber: `INST-2026-00${plans.length + 1}`,
      customerId: cust.id,
      customerName: cust.name,
      customerPhone: cust.phone,
      customerTier: cust.customerType,
      outletId: outlet.id,
      outletName: outlet.name,
      items: lineItems,
      totalAmount: totalOrder,
      downPayment: downPay,
      remainingBalance: balanceToFinance,
      frequency: planFrequency,
      installmentCount: planInstallmentCount,
      startDate: now.toISOString().slice(0, 10),
      status: 'ACTIVE',
      schedule: schedule,
      notes: planNotes,
      createdAt: `${now.toISOString().slice(0, 10)} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    };

    onAddPlan(newPlan);
    setCreateModalOpen(false);
    setExpandedPlanId(newPlan.id);
  };

  // Export CSV
  const handleExportInstallmentsCsv = () => {
    const filename = `customer_installments_${new Date().toISOString().slice(0, 10)}.csv`;
    const headers = [
      'Plan Number',
      'Customer Name',
      'Customer Phone',
      'Outlet',
      'Total Amount (GHS)',
      'Down Payment (GHS)',
      'Remaining Balance (GHS)',
      'Frequency',
      'Installment Count',
      'Status',
      'Created Date',
    ];

    const rows = filteredPlans.map((p) => [
      p.planNumber,
      p.customerName,
      p.customerPhone,
      p.outletName,
      p.totalAmount.toFixed(2),
      p.downPayment.toFixed(2),
      p.remainingBalance.toFixed(2),
      p.frequency,
      p.installmentCount,
      p.status,
      p.createdAt,
    ]);

    exportToCsv(filename, headers, rows);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* 1. TOP HEADER & ACTIONS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-300">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              Customer Installment Plans
            </h1>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300">
              Layaway &amp; Credit
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Enable customers to purchase high-value lighting fixtures &amp; systems on scheduled payment installments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportInstallmentsCsv}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-2xs transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-white shadow-xs transition-all cursor-pointer hover:opacity-95"
            style={{ backgroundColor: accentColor || 'var(--accent, #c55200)' }}
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>New Installment Plan</span>
          </button>
        </div>
      </div>

      {/* 2. SUMMARY METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Book Value */}
        <div className="bg-white p-5 rounded-xl border border-slate-300 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold tracking-wide uppercase">Total Credit Book</span>
            <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 font-mono">
              GH₵ {totalBookValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 font-medium">
              Across {plans.length} customer installment contracts
            </div>
          </div>
        </div>

        {/* Amount Collected */}
        <div className="bg-white p-5 rounded-xl border border-slate-300 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold tracking-wide uppercase">Collected to Date</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-emerald-600 font-mono">
              GH₵ {totalCollected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-emerald-700 font-medium mt-1">
              {totalBookValue > 0 ? ((totalCollected / totalBookValue) * 100).toFixed(1) : 0}% recovery rate
            </div>
          </div>
        </div>

        {/* Outstanding Receivables */}
        <div className="bg-white p-5 rounded-xl border border-slate-300 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold tracking-wide uppercase">Outstanding Receivables</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-blue-700 font-mono">
              GH₵ {totalBalanceDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 font-medium">
              In {activePlansCount} active customer plans
            </div>
          </div>
        </div>

        {/* Overdue Alerts */}
        <div className="bg-white p-5 rounded-xl border border-slate-300 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold tracking-wide uppercase">Overdue Plans</span>
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                overdueCount > 0 ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-400'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div
              className={`text-2xl font-black font-mono ${
                overdueCount > 0 ? 'text-rose-600' : 'text-slate-800'
              }`}
            >
              {overdueCount} {overdueCount === 1 ? 'Customer' : 'Customers'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 font-medium">
              Requires payment follow-up
            </div>
          </div>
        </div>
      </div>

      {/* 3. SEARCH & STATUS FILTER TABS */}
      <div className="bg-white p-4 rounded-xl border border-slate-300 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by customer name, phone, or plan number (e.g. INST-2026)..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
        </div>

        {/* Status Filters */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          {(['ALL', 'ACTIVE', 'OVERDUE', 'COMPLETED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st === 'ALL'
                ? 'All Plans'
                : st === 'ACTIVE'
                ? 'Active'
                : st === 'OVERDUE'
                ? 'Overdue'
                : 'Completed'}
            </button>
          ))}
        </div>

        {/* Outlet Filter */}
        <select
          value={outletFilter}
          onChange={(e) => setOutletFilter(e.target.value)}
          className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-700 focus:outline-hidden"
        >
          <option value="all">All Outlets</option>
          {outlets.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      {/* 4. INSTALLMENT PLANS LIST */}
      <div className="space-y-4">
        {filteredPlans.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-2xl border border-slate-300 text-slate-400">
            No customer installment plans match your search or filter criteria.
          </div>
        ) : (
          filteredPlans.map((plan) => {
            const isExpanded = expandedPlanId === plan.id;
            const progressPct =
              plan.totalAmount > 0
                ? Math.round(((plan.totalAmount - plan.remainingBalance) / plan.totalAmount) * 100)
                : 100;

            return (
              <div
                key={plan.id}
                className="bg-white rounded-2xl border border-slate-300 shadow-2xs overflow-hidden transition-all"
              >
                {/* Plan Card Header */}
                <div
                  onClick={() => setExpandedPlanId(isExpanded ? null : plan.id)}
                  className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs shrink-0"
                      style={{
                        backgroundColor: 'var(--accent-50, #fff7ed)',
                        color: 'var(--accent, #c55200)',
                      }}
                    >
                      {plan.planNumber.replace('INST-2026-', '#')}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black text-sm text-slate-900">{plan.customerName}</span>
                        <span className="text-[10px] font-mono px-2 py-0.2 rounded-md bg-slate-100 text-slate-600 font-bold">
                          {plan.planNumber}
                        </span>
                        {plan.status === 'COMPLETED' ? (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Settled
                          </span>
                        ) : plan.isOverdue ? (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Overdue
                          </span>
                        ) : (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Active Plan
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {plan.customerPhone}
                        </span>
                        <span>•</span>
                        <span>{plan.outletName}</span>
                        <span>•</span>
                        <span className="capitalize">{plan.frequency} ({plan.installmentCount} installments)</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Financial Progress */}
                  <div className="flex items-center gap-6 self-end lg:self-center">
                    <div className="text-right">
                      <div className="text-xs text-slate-400 font-medium">Balance Due:</div>
                      <div
                        className={`text-lg font-black font-mono ${
                          plan.remainingBalance > 0 ? 'text-blue-700' : 'text-emerald-700'
                        }`}
                      >
                        GH₵ {plan.remainingBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        of GH₵ {plan.totalAmount.toFixed(2)} total
                      </div>
                    </div>

                    <div className="w-24 hidden sm:block">
                      <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-1">
                        <span>Paid</span>
                        <span>{progressPct}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${progressPct}%`,
                            backgroundColor:
                              progressPct === 100
                                ? '#10b981'
                                : accentColor || 'var(--accent, #c55200)',
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {plan.status === 'ACTIVE' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenPayment(plan);
                          }}
                          className="px-3 py-1.5 rounded-xl text-xs font-black text-white shadow-xs transition-all cursor-pointer hover:opacity-95"
                          style={{ backgroundColor: accentColor || 'var(--accent, #c55200)' }}
                        >
                          Record Payment
                        </button>
                      )}
                      <ChevronDown
                        className={`w-4 h-4 text-slate-400 transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* Expanded Details: Schedule & Items */}
                {isExpanded && (
                  <div className="border-t border-slate-200 p-5 bg-slate-50/50 space-y-5">
                    {/* Items on Plan */}
                    <div>
                      <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
                        Purchased Goods on this Agreement:
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {plan.items.map((item, idx) => (
                          <div
                            key={idx}
                            className="bg-white p-3 rounded-xl border border-slate-300 flex items-center justify-between text-xs"
                          >
                            <div>
                              <div className="font-bold text-slate-900 truncate max-w-[180px]">
                                {item.productName}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono">
                                Qty: {item.quantity} × GH₵ {item.unitPrice.toFixed(2)}
                              </div>
                            </div>
                            <div className="font-bold font-mono text-slate-900">
                              GH₵ {item.lineTotal.toFixed(2)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Schedule Table */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                          Repayment Schedule &amp; Receipts:
                        </h4>
                        <span className="text-[11px] text-slate-500 font-medium">
                          Initial Down Payment: <strong className="text-slate-800">GH₵ {plan.downPayment.toFixed(2)}</strong>
                        </span>
                      </div>

                      <div className="overflow-x-auto bg-white rounded-xl border border-slate-300">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-500 border-b border-slate-300 font-bold uppercase tracking-wider text-[10px]">
                            <tr>
                              <th className="py-2.5 px-3">Instalment #</th>
                              <th className="py-2.5 px-3">Due Date</th>
                              <th className="py-2.5 px-3">Expected</th>
                              <th className="py-2.5 px-3">Amount Paid</th>
                              <th className="py-2.5 px-3">Payment Date / Ref</th>
                              <th className="py-2.5 px-3">Status</th>
                              <th className="py-2.5 px-3 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 font-medium text-slate-700">
                            {plan.schedule.map((item) => {
                              const isItemOverdue =
                                item.status !== 'PAID' &&
                                item.dueDate < new Date().toISOString().slice(0, 10);

                              return (
                                <tr key={item.installmentNumber} className="hover:bg-slate-50/70">
                                  <td className="py-2.5 px-3 font-bold text-slate-900">
                                    Installment {item.installmentNumber} of {plan.installmentCount}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono">
                                    <span className={isItemOverdue ? 'text-rose-600 font-bold' : ''}>
                                      {item.dueDate}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                                    GH₵ {item.expectedAmount.toFixed(2)}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-emerald-600 font-bold">
                                    {item.paidAmount > 0 ? `GH₵ ${item.paidAmount.toFixed(2)}` : '—'}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-[11px]">
                                    {item.paidDate ? (
                                      <div>
                                        <div className="font-bold text-slate-800">{item.paidDate}</div>
                                        <div className="text-[10px] text-slate-400">
                                          {item.receiptNumber} ({item.paymentMethod})
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-slate-400">Pending</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    {item.status === 'PAID' ? (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                                        Paid
                                      </span>
                                    ) : isItemOverdue ? (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-800">
                                        Overdue
                                      </span>
                                    ) : item.status === 'PARTIAL' ? (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-800">
                                        Partial
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-600">
                                        Upcoming
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-right">
                                    {item.status !== 'PAID' && (
                                      <button
                                        onClick={() => handleOpenPayment(plan, item.installmentNumber)}
                                        className="px-2.5 py-1 rounded-lg text-xs font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 transition-colors cursor-pointer"
                                      >
                                        Pay Now
                                      </button>
                                    )}
                                    {item.status === 'PAID' && item.receiptNumber && (
                                      <button
                                        onClick={() =>
                                          setPaymentReceiptSlip({
                                            plan: plan,
                                            installmentNum: item.installmentNumber,
                                            amountPaid: item.paidAmount,
                                            method: (item.paymentMethod || 'momo').toUpperCase(),
                                            reference: item.reference || '',
                                            date: item.paidDate || '',
                                            receiptNumber: item.receiptNumber,
                                            newBalance: plan.remainingBalance,
                                          })
                                        }
                                        className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                                        title="Reprint Installment Receipt"
                                      >
                                        Receipt
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 5. MODAL: RECORD INSTALLMENT PAYMENT */}
      {paymentModalOpen && activePlanForPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-modal-backdrop">
          <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl border border-slate-300 overflow-hidden animate-modal-card flex flex-col max-h-[92vh]">
            <div className="px-6 py-5 sm:px-8 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 stroke-[3]" />
                </div>
                <div>
                  <h3 className="font-black text-xl leading-tight">Record Installment Payment</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{activePlanForPayment.planNumber}</p>
                </div>
              </div>
              <button
                onClick={() => setPaymentModalOpen(false)}
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitPayment} className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-300 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer:</span>
                  <strong className="text-slate-900">{activePlanForPayment.customerName}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Contract:</span>
                  <span className="font-mono font-bold text-slate-900">GH₵ {activePlanForPayment.totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-blue-700 font-black text-base border-t border-slate-200 pt-2">
                  <span>Current Outstanding:</span>
                  <span className="font-mono">GH₵ {activePlanForPayment.remainingBalance.toFixed(2)}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1.5">
                  Select Installment Tranche *
                </label>
                <select
                  value={selectedInstallmentNum}
                  onChange={(e) => {
                    const num = parseInt(e.target.value);
                    setSelectedInstallmentNum(num);
                    const item = activePlanForPayment.schedule.find((s) => s.installmentNumber === num);
                    if (item) setPaymentAmount((item.expectedAmount - item.paidAmount).toString());
                  }}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-orange-500 font-medium text-slate-900"
                >
                  {activePlanForPayment.schedule.map((s) => (
                    <option key={s.installmentNumber} value={s.installmentNumber}>
                      Installment #{s.installmentNumber} (Due: {s.dueDate}) - GH₵ {s.expectedAmount.toFixed(2)}{' '}
                      {s.status === 'PAID' ? '✓ PAID' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1.5">
                  Payment Amount (GH₵) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  max={activePlanForPayment.remainingBalance}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-base bg-white border border-slate-300 rounded-lg focus:outline-orange-500 font-mono font-black text-slate-900"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-1.5">
                    Payment Channel *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-orange-500 font-medium text-slate-800"
                  >
                    <option value="momo">MTN / Telecel MoMo</option>
                    <option value="cash">Cash (Register Drawer)</option>
                    <option value="card">Visa / Mastercard POS</option>
                    <option value="transfer">Direct Bank Transfer</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-1.5">
                    Reference / TxID
                  </label>
                  <input
                    type="text"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="e.g. MOM-44910"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-orange-500 font-mono text-slate-900"
                  />
                </div>
              </div>

              <div className="pt-3 flex flex-col sm:flex-row items-center justify-end gap-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(false)}
                  className="w-full sm:w-auto px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-6 py-2.5 text-sm font-black text-white rounded-lg shadow-xs transition-all cursor-pointer hover:opacity-95"
                  style={{ backgroundColor: accentColor || 'var(--accent, #c55200)' }}
                >
                  Confirm &amp; Issue Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL: CREATE NEW INSTALLMENT PLAN */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-modal-backdrop">
          <div className="bg-white w-full max-w-4xl rounded-xl shadow-2xl border border-slate-300 overflow-hidden animate-modal-card max-h-[92vh] flex flex-col">
            <div className="px-6 py-5 sm:px-8 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-400 flex items-center justify-center">
                  <Plus className="w-5 h-5 stroke-[3]" />
                </div>
                <div>
                  <h3 className="font-black text-xl leading-tight">Create Customer Installment Agreement</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Configure layaway terms, initial deposit, and payment frequency</p>
                </div>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePlanSubmit} className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-1.5">
                    Select Customer *
                  </label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-orange-500 font-medium text-slate-800"
                    required
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phone}) - {c.customerType}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-1.5">
                    Store Outlet *
                  </label>
                  <select
                    value={planOutletId}
                    onChange={(e) => setPlanOutletId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-orange-500 font-medium text-slate-800"
                  >
                    {outlets.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Items in Agreement */}
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">
                  Lighting Goods &amp; Items to Finance *
                </label>
                <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  {planSelectedItems.map((item, index) => (
                    <div key={index} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <select
                        value={item.productId}
                        onChange={(e) => {
                          const prod = products.find((p) => p.id === e.target.value);
                          const newItems = [...planSelectedItems];
                          newItems[index] = {
                            ...newItems[index],
                            productId: e.target.value,
                            unitPrice: prod ? prod.retailPrice : 100,
                          };
                          setPlanSelectedItems(newItems);
                        }}
                        className="flex-1 px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-orange-500 font-medium text-slate-900"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} - GH₵ {p.retailPrice.toFixed(2)}
                          </option>
                        ))}
                      </select>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => {
                            const newItems = [...planSelectedItems];
                            newItems[index] = {
                              ...newItems[index],
                              quantity: parseInt(e.target.value) || 1,
                            };
                            setPlanSelectedItems(newItems);
                          }}
                          className="w-20 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-mono text-center font-bold text-slate-900"
                          title="Quantity"
                        />

                        <span className="text-sm font-mono font-bold text-slate-900 w-28 text-right shrink-0">
                          GH₵ {(item.quantity * item.unitPrice).toFixed(2)}
                        </span>

                        {planSelectedItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPlanSelectedItems(planSelectedItems.filter((_, i) => i !== index));
                            }}
                            className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-white cursor-pointer"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => {
                      setPlanSelectedItems([
                        ...planSelectedItems,
                        {
                          productId: products[0]?.id || '',
                          quantity: 1,
                          unitPrice: products[0]?.retailPrice || 100,
                        },
                      ]);
                    }}
                    className="text-sm font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1.5 cursor-pointer pt-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Another Fixture</span>
                  </button>
                </div>
              </div>

              {/* Installment Plan Terms */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-1">
                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-1.5">
                    Down Payment (GH₵) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={planDownPayment}
                    onChange={(e) => setPlanDownPayment(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-orange-500 font-mono font-bold text-slate-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-1.5">
                    Payment Frequency *
                  </label>
                  <select
                    value={planFrequency}
                    onChange={(e) => setPlanFrequency(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-orange-500 font-medium text-slate-800"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly (Fortnightly)</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-1.5">
                    No. of Installments *
                  </label>
                  <select
                    value={planInstallmentCount}
                    onChange={(e) => setPlanInstallmentCount(parseInt(e.target.value))}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-orange-500 font-medium text-slate-800"
                  >
                    <option value={2}>2 Installments</option>
                    <option value={3}>3 Installments</option>
                    <option value={4}>4 Installments</option>
                    <option value={6}>6 Installments</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1.5">
                  Agreement Notes / Project Site
                </label>
                <textarea
                  rows={3}
                  value={planNotes}
                  onChange={(e) => setPlanNotes(e.target.value)}
                  placeholder="e.g. Electrical installation contractor agreement for Airport Hills residence..."
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-orange-500 font-medium text-slate-900"
                />
              </div>

              <div className="pt-3 flex flex-col sm:flex-row items-center justify-end gap-3 shrink-0 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="w-full sm:w-auto px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-6 py-2.5 text-sm font-black text-white rounded-lg shadow-xs transition-all cursor-pointer hover:opacity-95"
                  style={{ backgroundColor: accentColor || 'var(--accent, #c55200)' }}
                >
                  Create Agreement &amp; Generate Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. MODAL: PRINTABLE OFFICIAL INSTALLMENT RECEIPT */}
      {paymentReceiptSlip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-modal-backdrop">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl border border-slate-300 overflow-hidden animate-modal-card p-6 sm:p-8 space-y-5 font-mono text-sm">
            <div className="text-center border-b border-dashed border-slate-300 pb-4 space-y-1.5 font-sans">
              <h3 className="font-black text-lg text-slate-900">RADIANCE LIGHTING</h3>
              <p className="text-xs text-slate-500">Showroom East Legon • Accra, Ghana</p>
              <div className="text-xs bg-slate-100 text-slate-700 px-3 py-1 rounded-full inline-block font-mono font-bold">
                INSTALLMENT PAYMENT RECEIPT
              </div>
            </div>

            <div className="space-y-2 border-b border-dashed border-slate-300 pb-4">
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Receipt #:</span>
                <span className="font-bold text-slate-900">{paymentReceiptSlip.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Plan #:</span>
                <span className="text-slate-900">{paymentReceiptSlip.plan.planNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Customer:</span>
                <span className="font-bold text-slate-900">{paymentReceiptSlip.plan.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Phone:</span>
                <span className="text-slate-700">{paymentReceiptSlip.plan.customerPhone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Date:</span>
                <span className="text-slate-700">{paymentReceiptSlip.date}</span>
              </div>
            </div>

            <div className="space-y-2 border-b border-dashed border-slate-300 pb-4">
              <div className="flex justify-between text-base font-black">
                <span className="font-sans">AMOUNT PAID:</span>
                <span className="text-emerald-700">GH₵ {paymentReceiptSlip.amountPaid.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600 text-xs">
                <span className="font-sans">Payment Method:</span>
                <span className="font-bold">{paymentReceiptSlip.method}</span>
              </div>
              {paymentReceiptSlip.reference && (
                <div className="flex justify-between text-slate-600 text-xs">
                  <span className="font-sans">Ref / TxID:</span>
                  <span>{paymentReceiptSlip.reference}</span>
                </div>
              )}
            </div>

            <div className="space-y-2 border-b border-dashed border-slate-300 pb-4">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 font-sans">Total Agreement:</span>
                <span>GH₵ {paymentReceiptSlip.plan.totalAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-blue-700 text-sm">
                <span className="font-sans">REMAINING BALANCE:</span>
                <span>GH₵ {paymentReceiptSlip.newBalance.toFixed(2)}</span>
              </div>
            </div>

            <div className="text-center text-xs text-slate-500 font-sans space-y-1 pt-1">
              <p>Thank you for partnering with Radiance Lighting!</p>
              <p className="text-[11px] text-slate-400">Quality Architectural Luminaires &amp; Power Systems</p>
            </div>

            <div className="flex items-center gap-3 pt-3 font-sans">
              <button
                onClick={() => setPaymentReceiptSlip(null)}
                className="flex-1 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-300 cursor-pointer"
              >
                Done
              </button>
              <button
                onClick={() => window.print()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-black text-white rounded-lg shadow-xs cursor-pointer"
                style={{ backgroundColor: accentColor || 'var(--accent, #c55200)' }}
              >
                <Printer className="w-4 h-4" />
                <span>Print Slip</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
