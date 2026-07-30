import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDialog } from '../contexts/DialogContext';
import Icon from '../components/Icon';

const DIVISIONS = ['nursery', 'primary', 'secondary', 'college'];
const TERMS = ['first', 'second', 'third'];
const FEE_CATEGORIES = ['tuition', 'registration', 'uniform', 'books', 'transport', 'feeding', 'development', 'other'];

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount || 0);

const emptyScheduleForm = {
  division: '', class: '', term: 'first', session: '2024/2025',
  dueDate: '', feeItems: [{ name: '', description: '', amount: '', category: 'tuition', isOptional: false }],
  latePaymentFee: '', notes: '',
  paymentPlan: { allowInstallments: false, numberOfInstallments: 1 }
};

const emptyDiscountForm = { amount: '', reason: '' };

// Multiple installments of the same fee schedule/student/term are separate
// Invoice documents under the hood (each independently payable), but showing
// them as unrelated rows is confusing — group them into one row/modal.
const groupInvoices = (list) => {
  const groups = new Map();
  for (const inv of list) {
    const scheduleId = inv.feeScheduleId?._id || inv.feeScheduleId || 'none';
    const studentId = inv.studentId?._id || inv.studentId || 'none';
    const key = `${scheduleId}-${studentId}-${inv.term}-${inv.session}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(inv);
  }
  return Array.from(groups.values()).map((g) => [...g].sort((a, b) => a.installmentNumber - b.installmentNumber));
};

const groupStatus = (group) => {
  if (group.every((inv) => inv.status === 'cancelled')) return 'cancelled';
  if (group.every((inv) => inv.status === 'paid')) return 'paid';
  if (group.some((inv) => inv.status === 'overdue')) return 'overdue';
  if (group.some((inv) => inv.amountPaid > 0)) return 'partial';
  return 'pending';
};

const Billing = () => {
  const { apiCall } = useAuth();
  const { alertDialog } = useDialog();
  const [tab, setTab] = useState('invoices');

  // Invoices
  const [invoices, setInvoices] = useState([]);
  const [invoicePagination, setInvoicePagination] = useState({ current: 1, total: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [activeInstallmentId, setActiveInstallmentId] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', paymentMethod: 'cash', notes: '' });
  const [paymentError, setPaymentError] = useState('');
  const [isPaying, setIsPaying] = useState(false);
  const [discountForm, setDiscountForm] = useState(emptyDiscountForm);
  const [discountError, setDiscountError] = useState('');
  const [isSavingDiscount, setIsSavingDiscount] = useState(false);
  const [togglingItemIndex, setTogglingItemIndex] = useState(null);

  const activeInstallment = selectedGroup?.find((inv) => inv._id === activeInstallmentId) || selectedGroup?.[0] || null;

  const openInvoiceGroup = (group) => {
    setSelectedGroup(group);
    const firstUnpaid = group.find((inv) => inv.status !== 'paid' && inv.status !== 'cancelled');
    setActiveInstallmentId((firstUnpaid || group[0])._id);
    setDiscountForm(emptyDiscountForm);
    setDiscountError('');
    setPaymentError('');
  };

  const applyUpdatedInstallment = (updated) => {
    setSelectedGroup((prev) => prev?.map((inv) => (inv._id === updated._id ? updated : inv)) || null);
    setInvoices((prev) => prev.map((inv) => (inv._id === updated._id ? updated : inv)));
  };

  // Fee Schedules
  const [schedules, setSchedules] = useState([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleForm, setScheduleForm] = useState(emptyScheduleForm);
  const [scheduleError, setScheduleError] = useState('');
  const [isSubmittingSchedule, setIsSubmittingSchedule] = useState(false);
  const [generatingFor, setGeneratingFor] = useState(null);
  const [editingScheduleId, setEditingScheduleId] = useState(null);
  const [knownClasses, setKnownClasses] = useState([]);

  const fetchKnownClasses = async (division) => {
    if (!division) { setKnownClasses([]); return; }
    const { data } = await apiCall(`/admin/classes?division=${division}`);
    if (data.success) setKnownClasses(data.data);
  };

  const fetchInvoices = async (page = 1) => {
    setInvoicesLoading(true);
    const query = new URLSearchParams({ page, limit: 20, ...(statusFilter && { status: statusFilter }) });
    const { data } = await apiCall(`/admin/invoices?${query}`);
    if (data.success) {
      setInvoices(data.data.invoices);
      setInvoicePagination(data.data.pagination);
    }
    setInvoicesLoading(false);
  };

  const fetchSchedules = async () => {
    setSchedulesLoading(true);
    const { data } = await apiCall('/admin/fee-schedules?limit=50');
    if (data.success) setSchedules(data.data.feeSchedules);
    setSchedulesLoading(false);
  };

  useEffect(() => {
    fetchInvoices(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    if (tab === 'schedules') fetchSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    setPaymentError('');
    setIsPaying(true);

    const { data } = await apiCall(`/admin/invoices/${activeInstallment._id}/payments`, {
      method: 'POST',
      body: JSON.stringify({ ...paymentForm, amount: parseFloat(paymentForm.amount) })
    });

    if (data.success) {
      applyUpdatedInstallment(data.data);
      setPaymentForm({ amount: '', paymentMethod: 'cash', notes: '' });
    } else {
      setPaymentError(data.message || data.errors?.[0]?.msg || 'Failed to record payment');
    }
    setIsPaying(false);
  };

  const handleToggleOptionalItem = async (itemIndex, included) => {
    setTogglingItemIndex(itemIndex);
    const { data } = await apiCall(`/student/${activeInstallment.studentId._id}/invoices/${activeInstallment._id}/optional-items`, {
      method: 'PATCH',
      body: JSON.stringify({ itemIndex, included })
    });
    if (data.success) {
      applyUpdatedInstallment(data.data);
    } else {
      await alertDialog(data.message || 'Failed to update the invoice', { title: 'Error' });
    }
    setTogglingItemIndex(null);
  };

  const handleApplyDiscount = async (e) => {
    e.preventDefault();
    setDiscountError('');
    setIsSavingDiscount(true);

    const { data } = await apiCall(`/admin/invoices/${activeInstallment._id}/discount`, {
      method: 'PATCH',
      body: JSON.stringify({ amount: parseFloat(discountForm.amount), reason: discountForm.reason })
    });

    if (data.success) {
      applyUpdatedInstallment(data.data);
      setDiscountForm(emptyDiscountForm);
    } else {
      setDiscountError(data.message || data.errors?.[0]?.msg || 'Failed to apply discount');
    }
    setIsSavingDiscount(false);
  };

  const updateFeeItem = (index, field, value) => {
    setScheduleForm((prev) => {
      const feeItems = [...prev.feeItems];
      feeItems[index] = { ...feeItems[index], [field]: value };
      return { ...prev, feeItems };
    });
  };

  const addFeeItem = () => {
    setScheduleForm((prev) => ({ ...prev, feeItems: [...prev.feeItems, { name: '', description: '', amount: '', category: 'other', isOptional: false }] }));
  };

  const removeFeeItem = (index) => {
    setScheduleForm((prev) => ({ ...prev, feeItems: prev.feeItems.filter((_, i) => i !== index) }));
  };

  const openCreateSchedule = () => {
    setEditingScheduleId(null);
    setScheduleForm(emptyScheduleForm);
    setScheduleError('');
    setShowScheduleForm(true);
  };

  const openEditSchedule = (schedule) => {
    setEditingScheduleId(schedule._id);
    fetchKnownClasses(schedule.division);
    setScheduleForm({
      division: schedule.division,
      class: schedule.class,
      term: schedule.term,
      session: schedule.session,
      dueDate: schedule.dueDate?.slice(0, 10) || '',
      feeItems: schedule.feeItems.map((item) => ({
        name: item.name, description: item.description || '', amount: item.amount, category: item.category, isOptional: item.isOptional || false
      })),
      latePaymentFee: schedule.latePaymentFee || '',
      notes: schedule.notes || '',
      paymentPlan: {
        allowInstallments: schedule.paymentPlan?.allowInstallments || false,
        numberOfInstallments: schedule.paymentPlan?.numberOfInstallments || 1
      }
    });
    setScheduleError('');
    setShowScheduleForm(true);
  };

  const handleSubmitSchedule = async (e) => {
    e.preventDefault();
    setScheduleError('');
    setIsSubmittingSchedule(true);

    const payload = {
      ...scheduleForm,
      feeItems: scheduleForm.feeItems.map((item) => ({ ...item, amount: parseFloat(item.amount) })),
      latePaymentFee: scheduleForm.latePaymentFee ? parseFloat(scheduleForm.latePaymentFee) : undefined,
      notes: scheduleForm.notes || undefined
    };

    const { data } = await apiCall(
      editingScheduleId ? `/admin/fee-schedules/${editingScheduleId}` : '/admin/fee-schedules',
      { method: editingScheduleId ? 'PATCH' : 'POST', body: JSON.stringify(payload) }
    );

    if (data.success) {
      setShowScheduleForm(false);
      setEditingScheduleId(null);
      setScheduleForm(emptyScheduleForm);
      fetchSchedules();
    } else {
      setScheduleError(data.message || data.errors?.[0]?.msg || `Failed to ${editingScheduleId ? 'update' : 'create'} fee schedule`);
    }
    setIsSubmittingSchedule(false);
  };

  const handleGenerateInvoices = async (scheduleId) => {
    setGeneratingFor(scheduleId);
    const { data } = await apiCall(`/admin/fee-schedules/${scheduleId}/generate-invoices`, { method: 'POST' });
    setGeneratingFor(null);
    if (data.success) {
      await alertDialog(data.message, { title: data.data.generated > 0 ? 'Invoices Generated' : 'Nothing to Generate' });
      if (tab === 'invoices') fetchInvoices(1);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Billing</h1>
          <p className="text-secondary">Fee schedules, invoices, and payments</p>
        </div>
      </div>

      <div className="filter-bar">
        <button className={`btn btn-sm ${tab === 'invoices' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('invoices')}>Invoices</button>
        <button className={`btn btn-sm ${tab === 'schedules' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('schedules')}>Fee Schedules</button>
      </div>

      {tab === 'invoices' && (
        <>
          <div className="filter-bar">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>

          {invoicesLoading ? (
            <div className="empty-state"><Icon name="loader" size={24} className="spinning" /></div>
          ) : invoices.length === 0 ? (
            <div className="empty-state">No invoices found.</div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Student</th>
                    <th>Amount Due</th>
                    <th>Balance</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {groupInvoices(invoices).map((group) => {
                    const first = group[0];
                    const totalDue = group.reduce((sum, inv) => sum + inv.amountDue, 0);
                    const totalBalance = group.reduce((sum, inv) => sum + inv.balance, 0);
                    const nextDue = group.find((inv) => inv.balance > 0)?.dueDate || first.dueDate;
                    return (
                      <tr key={first._id}>
                        <td data-label="Invoice #">
                          {first.invoiceNumber}
                          {group.length > 1 && <div className="text-secondary text-sm">{group.length} installments</div>}
                        </td>
                        <td data-label="Student">{first.studentId?.fullName}<br /><span className="text-secondary text-sm">{first.studentId?.regNumber}</span></td>
                        <td data-label="Amount Due">{formatCurrency(totalDue)}</td>
                        <td data-label="Balance">{formatCurrency(totalBalance)}</td>
                        <td data-label="Due Date">{new Date(nextDue).toLocaleDateString('en-GB')}</td>
                        <td data-label="Status"><span className={`badge badge-${groupStatus(group)}`}>{groupStatus(group)}</span></td>
                        <td>
                          <button className="btn btn-outline btn-sm" onClick={() => openInvoiceGroup(group)}>
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {invoicePagination.total > 1 && (
            <div className="pagination-bar">
              <button className="btn btn-outline btn-sm" disabled={invoicePagination.current <= 1} onClick={() => fetchInvoices(invoicePagination.current - 1)}>Previous</button>
              <span className="text-sm">Page {invoicePagination.current} of {invoicePagination.total}</span>
              <button className="btn btn-outline btn-sm" disabled={invoicePagination.current >= invoicePagination.total} onClick={() => fetchInvoices(invoicePagination.current + 1)}>Next</button>
            </div>
          )}
        </>
      )}

      {tab === 'schedules' && (
        <>
          <div className="page-header">
            <div />
            <button className="btn btn-primary" onClick={openCreateSchedule}>
              <Icon name="plus" size={16} /> New Fee Schedule
            </button>
          </div>

          {schedulesLoading ? (
            <div className="empty-state"><Icon name="loader" size={24} className="spinning" /></div>
          ) : schedules.length === 0 ? (
            <div className="empty-state">No fee schedules yet.</div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Division / Class</th>
                    <th>Term</th>
                    <th>Session</th>
                    <th>Total</th>
                    <th>Due Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s) => (
                    <tr key={s._id}>
                      <td data-label="Division / Class">{s.division} / {s.class}</td>
                      <td data-label="Term" style={{ textTransform: 'capitalize' }}>{s.term}</td>
                      <td data-label="Session">{s.session}</td>
                      <td data-label="Total">{formatCurrency(s.totalAmount)}</td>
                      <td data-label="Due Date">{new Date(s.dueDate).toLocaleDateString('en-GB')}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                          <button className="btn btn-outline btn-sm" onClick={() => openEditSchedule(s)}>
                            <Icon name="edit" size={14} /> Edit
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            disabled={generatingFor === s._id}
                            onClick={() => handleGenerateInvoices(s._id)}
                          >
                            {generatingFor === s._id ? <Icon name="loader" size={14} className="spinning" /> : 'Generate Invoices'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Invoice Detail Modal */}
      {selectedGroup && activeInstallment && (
        <div className="modal-backdrop" onClick={() => setSelectedGroup(null)}>
          <div className="modal-panel invoice-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setSelectedGroup(null)}><Icon name="close" size={22} /></button>

            <div className="invoice-letterhead">
              <div>
                <div className="school-mark">GMA SCHOOL</div>
                <div className="invoice-number">{selectedGroup[0].invoiceNumber}{selectedGroup.length > 1 && ` (${selectedGroup.length} installments)`}</div>
                <div className="invoice-sub">
                  {activeInstallment.term?.charAt(0).toUpperCase() + activeInstallment.term?.slice(1)} term · {activeInstallment.session}
                </div>
              </div>
              <div className="invoice-letterhead-right">
                <span className={`badge badge-${groupStatus(selectedGroup)}`}>{groupStatus(selectedGroup)}</span>
              </div>
            </div>

            <div className="invoice-parties">
              <div>
                <div className="label">Billed To</div>
                <div className="value">
                  <strong>{activeInstallment.studentId?.fullName}</strong>
                  {activeInstallment.studentId?.regNumber}
                  {(activeInstallment.studentId?.division || activeInstallment.studentId?.class) && (
                    <><br />{activeInstallment.studentId?.division} {activeInstallment.studentId?.class && `/ ${activeInstallment.studentId.class}`}</>
                  )}
                </div>
              </div>
              <div>
                <div className="label">Total Across Installments</div>
                <div className="value">
                  {formatCurrency(selectedGroup.reduce((s, inv) => s + inv.amountDue, 0))} due,{' '}
                  {formatCurrency(selectedGroup.reduce((s, inv) => s + inv.balance, 0))} outstanding
                </div>
              </div>
            </div>

            {selectedGroup.length > 1 && (
              <>
                <div className="invoice-section-title">Installments — select one to manage below</div>
                <table className="invoice-table" style={{ marginBottom: 'var(--space-6)' }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Due Date</th>
                      <th className="amount-col">Amount</th>
                      <th className="amount-col">Balance</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedGroup.map((inv) => (
                      <tr key={inv._id} style={inv._id === activeInstallmentId ? { background: 'var(--color-surface-light)' } : undefined}>
                        <td>{inv.installmentNumber}</td>
                        <td>{new Date(inv.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        <td className="amount-col">{formatCurrency(inv.amountDue)}</td>
                        <td className="amount-col">{formatCurrency(inv.balance)}</td>
                        <td><span className={`badge badge-${inv.status}`}>{inv.status}</span></td>
                        <td>
                          <button
                            className={`btn btn-sm ${inv._id === activeInstallmentId ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => { setActiveInstallmentId(inv._id); setDiscountForm(emptyDiscountForm); setDiscountError(''); setPaymentError(''); }}
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <div className="invoice-section-title">
              {selectedGroup.length > 1 ? `Installment ${activeInstallment.installmentNumber} — Fee Items` : 'Fee Items'}
            </div>
            <table className="invoice-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="amount-col">Amount</th>
                </tr>
              </thead>
              <tbody>
                {activeInstallment.feeItems?.map((item, i) => {
                  const included = item.included !== false;
                  // "Paid" only means the currently-included items are settled — optional
                  // items can still be opted into afterward, which reopens a balance.
                  const canToggle = item.isOptional && activeInstallment.status !== 'cancelled';
                  return (
                    <tr key={i} style={item.isOptional && !included ? { opacity: 0.65 } : undefined}>
                      <td>
                        {canToggle ? (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={included}
                              disabled={togglingItemIndex === i}
                              onChange={(e) => handleToggleOptionalItem(i, e.target.checked)}
                            />
                            <span>{item.name}</span>
                            <span className="text-secondary text-sm">(optional)</span>
                          </label>
                        ) : (
                          <>
                            {item.name}
                            {item.isOptional && <span className="text-secondary text-sm"> (optional — {included ? 'included' : 'not included'} in Amount Due)</span>}
                          </>
                        )}
                        {item.description && <div className="item-description">{item.description}</div>}
                      </td>
                      <td className="amount-col">{formatCurrency(item.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="invoice-summary">
              <div className="invoice-summary-row">
                <span>Subtotal</span>
                <span>{formatCurrency(activeInstallment.feeItems?.filter((item) => item.included !== false).reduce((sum, item) => sum + item.amount, 0))}</span>
              </div>
              {activeInstallment.discount?.amount > 0 && (
                <div className="invoice-summary-row discount">
                  <span>Discount ({activeInstallment.discount.reason})</span>
                  <span>−{formatCurrency(activeInstallment.discount.amount)}</span>
                </div>
              )}
              {activeInstallment.latePaymentFee > 0 && (
                <div className="invoice-summary-row">
                  <span>Late Payment Fee (if overdue)</span>
                  <span>{formatCurrency(activeInstallment.latePaymentFee)}</span>
                </div>
              )}
              <div className="invoice-summary-row total">
                <span>Amount Due</span>
                <span>{formatCurrency(activeInstallment.amountDue)}</span>
              </div>
              <div className="invoice-summary-row">
                <span>Amount Paid</span>
                <span>{formatCurrency(activeInstallment.amountPaid)}</span>
              </div>
              <div className={`invoice-summary-row total ${activeInstallment.balance > 0 ? 'balance-due' : 'balance-zero'}`}>
                <span>Balance</span>
                <span>{formatCurrency(activeInstallment.balance)}</span>
              </div>
            </div>

            {activeInstallment.paymentHistory?.length > 0 && (
              <>
                <div className="invoice-section-title">Payment History</div>
                <ul className="invoice-payment-list">
                  {activeInstallment.paymentHistory.map((p, i) => (
                    <li key={i}>
                      <div>
                        <div>{p.paymentMethod.replace('_', ' ').replace(/^./, (c) => c.toUpperCase())}{p.notes && ` — ${p.notes}`}</div>
                        <div className="payment-meta">
                          {new Date(p.paymentDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {p.receivedBy && ` · recorded by ${p.receivedBy.email || p.receivedBy.phone}`}
                        </div>
                      </div>
                      <span className="payment-amount">{formatCurrency(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {activeInstallment.discount?.amount > 0 && activeInstallment.discount.authorizedBy && (
              <p className="text-secondary text-sm" style={{ marginBottom: 'var(--space-5)' }}>
                Discount authorized by {activeInstallment.discount.authorizedBy.email || activeInstallment.discount.authorizedBy.phone}
              </p>
            )}

            {activeInstallment.status !== 'paid' && activeInstallment.status !== 'cancelled' && (
              <>
                <div className="invoice-actions">
                  <div className="invoice-section-title">Record Payment</div>
                  <form onSubmit={handleRecordPayment}>
                    {paymentError && (
                      <div className="admin-error-message">
                        <Icon name="alertCircle" size={18} />
                        <span>{paymentError}</span>
                      </div>
                    )}
                    <div className="form-row" style={{ alignItems: 'end' }}>
                      <div className="form-group">
                        <label>Amount</label>
                        <input
                          type="number" min="0.01" step="0.01" required
                          value={paymentForm.amount}
                          onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label>Method</label>
                        <select value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}>
                          <option value="cash">Cash</option>
                          <option value="bank_transfer">Bank Transfer</option>
                          <option value="card">Card (in person)</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Notes (optional)</label>
                      <input type="text" value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} />
                    </div>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={isPaying}>
                      {isPaying ? <Icon name="loader" size={14} className="spinning" /> : 'Record Payment'}
                    </button>
                  </form>
                </div>

                <div className="invoice-actions">
                  <div className="invoice-section-title">Apply Discount</div>
                  <form onSubmit={handleApplyDiscount}>
                    {discountError && (
                      <div className="admin-error-message">
                        <Icon name="alertCircle" size={18} />
                        <span>{discountError}</span>
                      </div>
                    )}
                    <div className="form-row" style={{ alignItems: 'end' }}>
                      <div className="form-group">
                        <label>Amount</label>
                        <input type="number" min="0" step="0.01" required value={discountForm.amount} onChange={(e) => setDiscountForm({ ...discountForm, amount: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label>Reason</label>
                        <input type="text" required value={discountForm.reason} onChange={(e) => setDiscountForm({ ...discountForm, reason: e.target.value })} />
                      </div>
                    </div>
                    <button type="submit" className="btn btn-outline btn-sm" disabled={isSavingDiscount}>
                      {isSavingDiscount ? <Icon name="loader" size={14} className="spinning" /> : 'Apply Discount'}
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Fee Schedule Modal (create/edit) */}
      {showScheduleForm && (
        <div className="modal-backdrop" onClick={() => setShowScheduleForm(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingScheduleId ? 'Edit Fee Schedule' : 'New Fee Schedule'}</h2>
              <button className="modal-close-btn" onClick={() => setShowScheduleForm(false)}><Icon name="close" size={22} /></button>
            </div>
            <form onSubmit={handleSubmitSchedule}>
              {scheduleError && (
                <div className="admin-error-message">
                  <Icon name="alertCircle" size={18} />
                  <span>{scheduleError}</span>
                </div>
              )}
              <div className="form-row">
                <div className="form-group">
                  <label>Division</label>
                  <select
                    required
                    value={scheduleForm.division}
                    onChange={(e) => { setScheduleForm({ ...scheduleForm, division: e.target.value }); fetchKnownClasses(e.target.value); }}
                  >
                    <option value="">Select division</option>
                    {DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Class</label>
                  <input
                    type="text"
                    list="known-classes"
                    required
                    value={scheduleForm.class}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, class: e.target.value })}
                  />
                  {scheduleForm.division && (
                    <p className="text-secondary text-sm" style={{ marginTop: 'var(--space-1)' }}>
                      {knownClasses.length > 0
                        ? `Must match a student's class exactly — currently in use: ${knownClasses.join(', ')}.`
                        : `No students are in the ${scheduleForm.division} division yet — nobody will be billed until a matching student exists.`}
                    </p>
                  )}
                </div>
              </div>
              <datalist id="known-classes">
                {knownClasses.map((c) => <option key={c} value={c} />)}
              </datalist>
              <div className="form-row">
                <div className="form-group">
                  <label>Term</label>
                  <select value={scheduleForm.term} onChange={(e) => setScheduleForm({ ...scheduleForm, term: e.target.value })}>
                    {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Session</label>
                  <input type="text" required value={scheduleForm.session} onChange={(e) => setScheduleForm({ ...scheduleForm, session: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Due Date</label>
                <input type="date" required value={scheduleForm.dueDate} onChange={(e) => setScheduleForm({ ...scheduleForm, dueDate: e.target.value })} />
              </div>

              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-2)', display: 'block' }}>Fee Items</label>
              {scheduleForm.feeItems.map((item, i) => (
                <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                  <div className="form-row" style={{ alignItems: 'end', marginBottom: 'var(--space-2)' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <input type="text" placeholder="Name (e.g. Tuition)" required value={item.name} onChange={(e) => updateFeeItem(i, 'name', e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, display: 'flex', gap: 'var(--space-2)' }}>
                      <input type="number" placeholder="Amount" min="0" required value={item.amount} onChange={(e) => updateFeeItem(i, 'amount', e.target.value)} />
                      <select value={item.category} onChange={(e) => updateFeeItem(i, 'category', e.target.value)}>
                        {FEE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      {scheduleForm.feeItems.length > 1 && (
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => removeFeeItem(i)}><Icon name="x" size={14} /></button>
                      )}
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 'var(--space-2)' }}>
                    <input
                      type="text" placeholder="Description (optional)"
                      value={item.description || ''} onChange={(e) => updateFeeItem(i, 'description', e.target.value)}
                    />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 400, fontSize: 'var(--text-sm)' }}>
                    <input type="checkbox" style={{ width: 'auto' }} checked={item.isOptional || false} onChange={(e) => updateFeeItem(i, 'isOptional', e.target.checked)} />
                    Optional item (e.g. uniform) — excluded from the required total
                  </label>
                </div>
              ))}
              <button type="button" className="btn btn-outline btn-sm" onClick={addFeeItem} style={{ marginBottom: 'var(--space-4)' }}>
                <Icon name="plus" size={14} /> Add Fee Item
              </button>

              <div className="form-group">
                <label>Late Payment Fee (optional)</label>
                <input type="number" min="0" value={scheduleForm.latePaymentFee} onChange={(e) => setScheduleForm({ ...scheduleForm, latePaymentFee: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Notes (optional)</label>
                <textarea rows={2} value={scheduleForm.notes} onChange={(e) => setScheduleForm({ ...scheduleForm, notes: e.target.value })} />
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 400 }}>
                  <input
                    type="checkbox" style={{ width: 'auto' }}
                    checked={scheduleForm.paymentPlan.allowInstallments}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, paymentPlan: { ...scheduleForm.paymentPlan, allowInstallments: e.target.checked } })}
                  />
                  Allow installment payments
                </label>
              </div>
              {scheduleForm.paymentPlan.allowInstallments && (
                <div className="form-group">
                  <label>Number of Installments (max 4)</label>
                  <input
                    type="number" min="1" max="4"
                    value={scheduleForm.paymentPlan.numberOfInstallments}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, paymentPlan: { ...scheduleForm.paymentPlan, numberOfInstallments: parseInt(e.target.value) || 1 } })}
                  />
                  <p className="text-secondary text-sm" style={{ marginTop: 'var(--space-2)' }}>
                    "Generate Invoices" will split the total evenly across this many invoices per student, spaced a month apart.
                  </p>
                </div>
              )}

              <button type="submit" className="btn btn-primary btn-full" disabled={isSubmittingSchedule}>
                {isSubmittingSchedule ? <Icon name="loader" size={18} className="spinning" /> : (editingScheduleId ? 'Save Changes' : 'Create Fee Schedule')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Billing;
