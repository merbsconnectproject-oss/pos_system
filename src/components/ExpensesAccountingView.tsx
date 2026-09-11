import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Receipt,
  Plus,
  Search,
  Filter,
  Download,
  Calendar,
  Building2,
  Wallet,
  Tag,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Trash2,
  Printer,
  ChevronDown,
  CreditCard,
  Building,
  Sparkles,
  PieChart,
} from 'lucide-react';
import { Expense, ExpenseCategory, Outlet, CompletedSale, OutletId } from '../types';
import { exportToCsv } from '../utils/csvExport';

interface ExpensesAccountingViewProps {
  expenses: Expense[];
  onAddExpense: (expense: Expense) => void;
  onDeleteExpense: (expenseId: string) => void;
  currentOutlet: Outlet;
  outlets: Outlet[];
  sales: CompletedSale[];
  accentColor?: string;
}

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Rent & Lease',
  'Utilities & Power',
  'Staff & Payroll',
  'Delivery & Haulage',
  'Advertising & Marketing',
  'Maintenance & Repairs',
  'Packaging & Bags',
  'Taxes, Levies & Licenses',
  'Office & Communication',
  'Miscellaneous',
];

export const ExpensesAccountingView: React.FC<ExpensesAccountingViewProps> = ({
  expenses = [],
  onAddExpense,
  onDeleteExpense,
  currentOutlet,
  outlets,
  sales = [],
  accentColor,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | 'today' | 'month' | 'quarter'>('all');
  const [outletFilter, setOutletFilter] = useState<string>(
    currentOutlet?.id === 'all-outlets' ? 'all' : (currentOutlet?.id || 'all')
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [statementPrintModalOpen, setStatementPrintModalOpen] = useState(false);

  // Form State
  const [formCategory, setFormCategory] = useState<ExpenseCategory | ''>('');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formOutletId, setFormOutletId] = useState<OutletId | ''>('');
  const [formPayee, setFormPayee] = useState('');
  const [formPaymentMethod, setFormPaymentMethod] = useState<
    'Cash (Drawer)' | 'Mobile Money' | 'Bank Transfer' | 'Cheque' | 'Corporate Card' | ''
  >('');
  const [formRef, setFormRef] = useState('');
  const [formTaxDeductible, setFormTaxDeductible] = useState(false);

  // Filtered Expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const matchesOutlet =
        outletFilter === 'all' || e.outletId === outletFilter;
      const matchesCategory =
        categoryFilter === 'ALL' || e.category === categoryFilter;
      const matchesSearch =
        e.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.payee.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.referenceNumber && e.referenceNumber.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchesOutlet && matchesCategory && matchesSearch;
    });
  }, [expenses, outletFilter, categoryFilter, searchTerm]);

  // Financial Calculations
  const relevantSales = useMemo(() => {
    return sales.filter((s) => {
      if (s.status === 'VOIDED') return false;
      if (outletFilter !== 'all' && s.outletId !== outletFilter) return false;
      return true;
    });
  }, [sales, outletFilter]);

  // Total Gross Revenue
  const totalRevenue = useMemo(() => {
    return relevantSales.reduce((sum, s) => sum + s.total, 0);
  }, [relevantSales]);

  // Cost of Goods Sold (COGS)
  const totalCogs = useMemo(() => {
    return relevantSales.reduce((acc, sale) => {
      const saleCogs = sale.items.reduce((itemSum, item) => {
        const itemCost =
          item.frozenCostPrice ||
          (item.product.costPrice && item.product.costPrice[sale.outletId]) ||
          0;
        return itemSum + itemCost * item.quantity;
      }, 0);
      return acc + saleCogs;
    }, 0);
  }, [relevantSales]);

  const grossProfit = totalRevenue - totalCogs;
  const grossMarginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  // Total Operating Expenses
  const totalOperatingExpenses = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  // Net Profit / Loss
  const netProfit = grossProfit - totalOperatingExpenses;
  const netMarginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    filteredExpenses.forEach((e) => {
      map[e.category] = (map[e.category] || 0) + e.amount;
    });
    return Object.entries(map)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: totalOperatingExpenses > 0 ? (amount / totalOperatingExpenses) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredExpenses, totalOperatingExpenses]);

  // Handle Create Expense
  const handleSubmitExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCategory || !formOutletId || !formPaymentMethod || !formDate || !formTitle.trim() || !formAmount || parseFloat(formAmount) <= 0) return;

    const matchedOutlet = outlets.find((o) => o.id === formOutletId);
    const outletName = matchedOutlet ? matchedOutlet.name : 'Radiance Lighting';

    const newExpense: Expense = {
      id: `exp-${Date.now()}`,
      date: formDate,
      category: formCategory,
      title: formTitle.trim(),
      description: formDescription.trim(),
      amount: parseFloat(formAmount),
      outletId: formOutletId,
      outletName: outletName,
      payee: formPayee.trim() || 'General Vendor',
      paymentMethod: formPaymentMethod,
      referenceNumber: formRef.trim() || `EXP-${Math.floor(1000 + Math.random() * 9000)}`,
      taxDeductible: formTaxDeductible,
      recordedBy: 'Ama Serwaa',
      status: 'PAID',
    };

    onAddExpense(newExpense);
    setModalOpen(false);

    // Reset Form
    setFormTitle('');
    setFormDescription('');
    setFormAmount('');
    setFormDate('');
    setFormCategory('');
    setFormOutletId('');
    setFormPayee('');
    setFormPaymentMethod('');
    setFormRef('');
    setFormTaxDeductible(false);
  };

  // Export CSV
  const handleExportExpensesCsv = () => {
    const filename = `expenses_accounting_${outletFilter}_${new Date().toISOString().slice(0, 10)}.csv`;
    const headers = [
      'Expense Date',
      'Reference #',
      'Category',
      'Title / Description',
      'Outlet',
      'Vendor / Payee',
      'Payment Method',
      'Amount (GHS)',
      'Tax Deductible',
      'Recorded By',
      'Status',
    ];

    const rows = filteredExpenses.map((exp) => [
      exp.date,
      exp.referenceNumber || '',
      exp.category,
      `${exp.title} ${exp.description ? '- ' + exp.description : ''}`,
      exp.outletName,
      exp.payee,
      exp.paymentMethod,
      exp.amount.toFixed(2),
      exp.taxDeductible ? 'YES' : 'NO',
      exp.recordedBy,
      exp.status,
    ]);

    exportToCsv(filename, headers, rows);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in">
      {/* 1. TOP HEADER & PRIMARY ACTIONS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-300">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Accounting &amp; Expense Tracking
            </h1>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
              Live P&amp;L
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Monitor operating expenses, cost of sales, and consolidated net profit across branches.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setStatementPrintModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-2xs transition-all cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>P&amp;L Statement</span>
          </button>

          <button
            onClick={handleExportExpensesCsv}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-white shadow-xs transition-all cursor-pointer hover:opacity-95"
            style={{ backgroundColor: accentColor || 'var(--accent, #c55200)' }}
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Record Expense</span>
          </button>
        </div>
      </div>

      {/* 2. EXECUTIVE P&L FINANCIAL CARDS (Solid Darker Shade) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Gross Revenue */}
        <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold tracking-wide uppercase flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-400" /> Gross Revenue (POS)
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono mt-1">
              GH₵ {totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 font-medium">
            From {relevantSales.length} completed transactions
          </div>
        </div>

        {/* Cost of Goods Sold (COGS) */}
        <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold tracking-wide uppercase flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-teal-400" /> Cost of Sales (COGS)
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono mt-1">
              GH₵ {totalCogs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-teal-400 font-medium">
            Gross Profit: GH₵ {grossProfit.toLocaleString('en-US', { minimumFractionDigits: 0 })} ({grossMarginPct.toFixed(1)}%)
          </div>
        </div>

        {/* Operating Expenses (OpEx) */}
        <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold tracking-wide uppercase flex items-center gap-1.5">
                <TrendingDown className="w-4 h-4 text-rose-400" /> Operating Expenses
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-rose-400 font-mono mt-1">
              GH₵ {totalOperatingExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 font-medium">
            Across {filteredExpenses.length} expense entries
          </div>
        </div>

        {/* Net Profit / Margin */}
        <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold tracking-wide uppercase flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-cyan-400" /> Net Profit / Margin
              </span>
            </div>
            <div className={`text-2xl sm:text-3xl font-black font-mono mt-1 ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              GH₵ {netProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-xs font-medium text-slate-300">
            Net Margin: <strong className={netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{netMarginPct.toFixed(1)}%</strong> of Revenue
          </div>
        </div>
      </div>

      {/* 3. SEARCH & FILTERS TOOLBAR */}
      <div className="bg-white rounded-xl p-4 border border-slate-300 shadow-xs flex flex-col lg:flex-row gap-3 items-center justify-between">
        <div className="relative w-full lg:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search description, payee, or reference #..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-semibold text-slate-700 focus:outline-hidden"
          >
            <option value="ALL">All Categories</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={outletFilter}
            onChange={(e) => setOutletFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-semibold text-slate-700 focus:outline-hidden"
          >
            <option value="all">All Outlets</option>
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 4. CATEGORY SPEND BREAKDOWN & EXPENSE LEDGER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left: Category Spend Breakdown */}
        <div className="lg:col-span-1 bg-white p-5 rounded-2xl border border-slate-300 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-300">
            <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <PieChart className="w-4 h-4 text-accent-500" />
              <span>Expense Allocation</span>
            </h2>
            <span className="text-xs text-slate-500 font-mono font-bold">
              GH₵ {totalOperatingExpenses.toFixed(0)} total
            </span>
          </div>

          <div className="space-y-3 max-h-[390px] overflow-y-auto pr-1">
            {categoryBreakdown.map((item) => (
              <div key={item.category} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 truncate max-w-[170px]">
                    {item.category}
                  </span>
                  <span className="font-mono text-slate-900 font-bold">
                    GH₵ {item.amount.toLocaleString('en-US', { minimumFractionDigits: 0 })} ({item.percentage.toFixed(0)}%)
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: accentColor || 'var(--accent, #c55200)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Expenses Ledger */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-300 shadow-xs overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-300 bg-slate-50/70">
            <h2 className="text-sm font-black text-slate-900">Expense Ledger</h2>
            <span className="text-[11px] text-slate-500 font-medium">
              {filteredExpenses.length} {filteredExpenses.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          {/* Ledger Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600 border-b border-slate-300 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-3.5">Date / Ref</th>
                  <th className="py-3 px-3.5">Description &amp; Category</th>
                  <th className="py-3 px-3.5">Payee / Outlet</th>
                  <th className="py-3 px-3.5">Method</th>
                  <th className="py-3 px-3.5 text-right">Amount</th>
                  <th className="py-3 px-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium text-slate-700">
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No expense records found matching filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                        <div className="font-bold text-slate-900">{exp.date}</div>
                        <div className="text-[10px] text-slate-400">{exp.referenceNumber}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{exp.title}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] px-2 py-0.2 rounded-md bg-slate-100 text-slate-600 font-medium">
                            {exp.category}
                          </span>
                          {exp.taxDeductible && (
                            <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1 rounded border border-emerald-200">
                              Tax Deductible
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-800">{exp.payee}</div>
                        <div className="text-[10px] text-slate-400">{exp.outletName}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 whitespace-nowrap">
                          {exp.paymentMethod}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600 whitespace-nowrap">
                        GH₵ {exp.amount.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => onDeleteExpense(exp.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete Expense Entry"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 5. MODAL: RECORD NEW EXPENSE */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-modal-backdrop">
          <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl border border-slate-300 overflow-hidden animate-modal-card flex flex-col max-h-[92vh]">
            <div className="px-6 py-5 sm:px-8 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent-500/20 border border-accent-500/40 text-accent-400 flex items-center justify-center">
                  <Plus className="w-5 h-5 stroke-[3]" />
                </div>
                <div>
                  <h3 className="font-black text-xl leading-tight">Record Operational Expense</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Log showroom bills, haulage, staff compensation, and maintenance</p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitExpense} className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-1.5">
                    Expense Category *
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as ExpenseCategory | '')}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-accent-500 font-medium text-slate-800"
                    required
                  >
                    <option value="" disabled>Select expense category</option>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-1.5">
                    Store Outlet *
                  </label>
                  <select
                    required
                    value={formOutletId}
                    onChange={(e) => setFormOutletId(e.target.value as OutletId | '')}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-accent-500 font-medium text-slate-800"
                  >
                    <option value="" disabled>Select outlet</option>
                    {outlets.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} ({o.town})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1.5">
                  Expense Title / Purpose *
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. ECG Power Utility Bill for Main Hardware Showroom"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-accent-500 font-medium text-slate-900"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-1.5">
                    Amount (GH₵) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 text-base bg-white border border-slate-300 rounded-lg focus:outline-accent-500 font-mono font-bold text-slate-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-1.5">
                    Date of Expense *
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-accent-500 font-medium text-slate-800"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-1.5">
                    Vendor / Payee Name *
                  </label>
                  <input
                    type="text"
                    value={formPayee}
                    onChange={(e) => setFormPayee(e.target.value)}
                    placeholder="e.g. Electricity Company of Ghana / Allied Haulage"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-accent-500 font-medium text-slate-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-1.5">
                    Payment Method *
                  </label>
                  <select
                    required
                    value={formPaymentMethod}
                    onChange={(e) => setFormPaymentMethod(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-accent-500 font-medium text-slate-800"
                  >
                    <option value="" disabled>Select payment method</option>
                    <option value="Cash (Drawer)">Cash (Drawer Float)</option>
                    <option value="Mobile Money">Mobile Money (MoMo)</option>
                    <option value="Bank Transfer">Bank Transfer (ACH/Wire)</option>
                    <option value="Corporate Card">Corporate Card</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-1.5">
                    Receipt / Invoice Ref #
                  </label>
                  <input
                    type="text"
                    value={formRef}
                    onChange={(e) => setFormRef(e.target.value)}
                    placeholder="e.g. INV-9942 or REC-002"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-accent-500 font-mono text-slate-900"
                  />
                </div>

                <div className="flex items-center pt-2 sm:pt-6">
                  <label className="flex items-center gap-3 text-sm font-bold text-slate-800 cursor-pointer bg-slate-50 p-3 rounded-lg border border-slate-200 w-full">
                    <input
                      type="checkbox"
                      checked={formTaxDeductible}
                      onChange={(e) => setFormTaxDeductible(e.target.checked)}
                      className="w-4 h-4 rounded text-accent-600 focus:ring-accent-500 border-slate-300 cursor-pointer"
                    />
                    <span>Tax Deductible Business Expense</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1.5">
                  Notes &amp; Description (Optional)
                </label>
                <textarea
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Additional context, department cost center or management sign-off notes..."
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-accent-500 font-medium text-slate-900"
                />
              </div>

              <div className="pt-3 flex flex-col sm:flex-row items-center justify-end gap-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="w-full sm:w-auto px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer border border-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-6 py-2.5 text-sm font-black text-white rounded-lg shadow-xs transition-all cursor-pointer hover:opacity-95"
                  style={{ backgroundColor: accentColor || 'var(--accent, #c55200)' }}
                >
                  Save Expense Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. MODAL: PRINTABLE P&L STATEMENT */}
      {statementPrintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-modal-backdrop">
          <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl border border-slate-300 overflow-hidden animate-modal-card p-6 sm:p-8 space-y-6 flex flex-col max-h-[92vh]">
            <div className="border-b border-slate-300 pb-4 text-center space-y-1.5 shrink-0">
              <h2 className="text-xl font-black uppercase text-slate-900 tracking-wider">
                Radiance Lighting &amp; Outlets
              </h2>
              <p className="text-sm text-slate-600 font-medium">
                Consolidated Profit &amp; Loss Financial Statement
              </p>
              <div className="text-xs text-slate-400 font-mono">
                Generated: {new Date().toLocaleDateString('en-GB')} | Currency: GHS (GH₵)
              </div>
            </div>

            <div className="space-y-4 text-sm overflow-y-auto flex-1">
              <div className="flex justify-between py-2 border-b border-slate-200 font-bold">
                <span className="text-slate-700">Gross Sales Revenue:</span>
                <span className="font-mono text-slate-900 text-base">GH₵ {totalRevenue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-200 text-slate-600">
                <span>Less: Cost of Goods Sold (COGS):</span>
                <span className="font-mono text-teal-700 text-base">- GH₵ {totalCogs.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2.5 border-b border-slate-300 font-black text-slate-900 bg-slate-50 px-3 rounded-lg text-base">
                <span>GROSS PROFIT:</span>
                <span className="font-mono">GH₵ {grossProfit.toFixed(2)} ({grossMarginPct.toFixed(1)}%)</span>
              </div>

              <div className="pt-2">
                <div className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
                  Operating Expenses (OpEx):
                </div>
                <div className="space-y-1.5">
                  {categoryBreakdown.map((c) => (
                    <div key={c.category} className="flex justify-between py-1 text-slate-600 pl-3 text-sm">
                      <span>{c.category}:</span>
                      <span className="font-mono text-rose-600 font-bold">GH₵ {c.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between py-2 border-b border-slate-200 font-bold text-rose-600 text-base">
                <span>Total Operating Expenses:</span>
                <span className="font-mono">- GH₵ {totalOperatingExpenses.toFixed(2)}</span>
              </div>

              <div
                className={`flex justify-between py-3 px-4 rounded-xl font-black text-base ${
                  netProfit >= 0 ? 'bg-emerald-100 text-emerald-950' : 'bg-rose-100 text-rose-950'
                }`}
              >
                <span>NET PROFIT / (LOSS):</span>
                <span className="font-mono text-lg">GH₵ {netProfit.toFixed(2)} ({netMarginPct.toFixed(1)}%)</span>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200 shrink-0">
              <button
                onClick={() => setStatementPrintModalOpen(false)}
                className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-300 cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-black text-white rounded-lg shadow-xs cursor-pointer"
                style={{ backgroundColor: accentColor || 'var(--accent, #c55200)' }}
              >
                <Printer className="w-4 h-4" />
                <span>Print Official Statement</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
