import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from './Modal';
import { ApiError, submitRequest } from '../services/api';
import { addDaysISO, todayISO } from '../lib/format';
import type { RequestOption, SubmitResult } from '../types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
type Fields = 'fullName' | 'gmail' | 'contactEmail' | 'servicePassword' | 'dueDate';
type Errors = Partial<Record<Fields, string>>;

interface Props { option: RequestOption; onClose: () => void; onSuccess: (r: SubmitResult) => void }

export function RequestForm({ option, onClose, onSuccess }: Props) {
  const [v, setV] = useState<Record<Fields, string>>({ fullName: '', gmail: '', contactEmail: '', servicePassword: '', dueDate: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: Fields) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));

  function validate(): Errors {
    const e: Errors = {};
    if (v.fullName.trim().length < 2) e.fullName = 'Enter your full name.';
    if (!EMAIL_RE.test(v.gmail.trim()) || !/@(gmail|googlemail)\.com$/i.test(v.gmail.trim())) e.gmail = 'Enter a valid Gmail address.';
    if (!EMAIL_RE.test(v.contactEmail.trim())) e.contactEmail = 'Enter a valid contact email address.';
    if (!v.servicePassword.length) e.servicePassword = 'Enter the password you were given.';
    else if (v.servicePassword.length > 256) e.servicePassword = 'Password must be 256 characters or fewer.';
    if (!v.dueDate) e.dueDate = 'Choose a completion date.';
    else if (v.dueDate < todayISO()) e.dueDate = 'The date cannot be in the past.';
    else if (v.dueDate > addDaysISO(365)) e.dueDate = 'Choose a date within the next year.';
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return; // duplicate-submit guard
    setFormError('');
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const result = await submitRequest({
        fullName: v.fullName.trim(), gmail: v.gmail.trim(), contactEmail: v.contactEmail.trim(),
        servicePassword: v.servicePassword, dueDate: v.dueDate, optionKey: option.key,
      });
      onSuccess(result);
    } catch (err) {
      const e2 = err as ApiError;
      if (e2.field && e2.field in v) setErrors({ [e2.field]: e2.message });
      else setFormError(e2.message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  const field = (k: Fields, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="field">
      <label htmlFor={k}>{label}</label>
      <input id={k} value={v[k]} onChange={set(k)} aria-invalid={!!errors[k]} disabled={busy} {...props} />
      {errors[k] && <p className="error-text" role="alert">{errors[k]}</p>}
    </div>
  );

  return (
    <Modal title={option.name} onClose={onClose} locked={busy}>
      <form onSubmit={submit} noValidate>
        {field('fullName', 'Full name', { autoComplete: 'name', maxLength: 100 })}
        <div className="row">
          {field('gmail', 'Gmail address', { type: 'email', autoComplete: 'email', maxLength: 254 })}
          {field('contactEmail', 'Contact email', { type: 'email', maxLength: 254 })}
        </div>
        <div className="row">
          {field('servicePassword', 'Password', { type: 'password', autoComplete: 'off', spellCheck: false, maxLength: 256 })}
          {field('dueDate', 'Requested completion date', { type: 'date', min: todayISO(), max: addDaysISO(365) })}
        </div>
        {formError && <p className="banner error" role="alert">{formError}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn primary" style={{ '--accent': option.accent } as React.CSSProperties} disabled={busy}>
            {busy ? <><Loader2 size={16} className="spin" /> Submitting</> : 'Submit request'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
