import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from './Modal';
import { ApiError, submitRequest } from '../services/api';
import { getTerms } from '../services/terms';
import { addDaysISO, todayISO } from '../lib/format';
import type { RequestOption, SubmitResult, TermsSettings, UserProfile } from '../types';

type Fields = 'dueDate';
type Errors = Partial<Record<Fields, string>>;

interface Props {
  option: RequestOption;
  profile: UserProfile;
  accountEmail: string;
  onClose: () => void;
  onSuccess: (r: SubmitResult) => void;
}

export function RequestForm({ option, profile, accountEmail, onClose, onSuccess }: Props) {
  const [v, setV] = useState<Record<Fields, string>>({ dueDate: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [terms, setTerms] = useState<TermsSettings | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsLoading, setTermsLoading] = useState(true);
  const [termsLoadError, setTermsLoadError] = useState('');
  const [termsError, setTermsError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: Fields) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));

  const loadTerms = useCallback(async () => {
    setTermsLoading(true);
    setTermsLoadError('');
    try {
      setTerms(await getTerms());
      setTermsAccepted(false);
    } catch (e) {
      setTermsLoadError((e as Error).message || 'Could not load the terms and conditions.');
    } finally {
      setTermsLoading(false);
    }
  }, []);

  useEffect(() => { loadTerms(); }, [loadTerms]);

  function validate(): Errors {
    const e: Errors = {};
    if (!v.dueDate) e.dueDate = 'Choose a completion date.';
    else if (v.dueDate < todayISO()) e.dueDate = 'The date cannot be in the past.';
    else if (v.dueDate > addDaysISO(365)) e.dueDate = 'Choose a date within the next year.';
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return; // duplicate-submit guard
    setFormError('');
    setTermsError('');
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    if (!terms || !terms.terms_text.trim()) {
      setFormError('Terms and conditions are not available yet. Please try again later.');
      return;
    }
    if (!termsAccepted) {
      setTermsError('You must agree to the terms and conditions before submitting.');
      return;
    }
    setBusy(true);
    try {
      const result = await submitRequest({
        dueDate: v.dueDate, optionKey: option.key,
        acceptedTerms: termsAccepted, termsVersion: terms.version, termsText: terms.terms_text,
      });
      onSuccess(result);
    } catch (err) {
      const e2 = err as ApiError;
      if (e2.code === 'terms_changed') {
        setTermsError(e2.message);
        await loadTerms();
      } else if (e2.code === 'terms_not_configured') {
        setTermsError(e2.message);
        await loadTerms();
      } else if (e2.field && e2.field in v) setErrors({ [e2.field]: e2.message });
      else setFormError(e2.message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  const termsReady = Boolean(terms?.terms_text.trim());
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
        <p className="muted small">
          This request will use your saved {profile.school_name} school account and send updates to {accountEmail}.
        </p>
        {field('dueDate', 'Requested completion date', { type: 'date', min: todayISO(), max: addDaysISO(365) })}
        <section className="terms-acceptance" aria-labelledby="terms-heading">
          <h3 id="terms-heading">Terms and conditions</h3>
          {termsLoading && <p className="muted small">Loading terms…</p>}
          {termsLoadError && (
            <p className="banner error" role="alert">
              Could not load the terms. <button type="button" className="btn ghost sm" onClick={loadTerms} disabled={termsLoading}>Retry</button>
            </p>
          )}
          {!termsLoading && !termsLoadError && !termsReady && (
            <p className="banner warn">The terms have not been configured yet. Please try again later.</p>
          )}
          {termsReady && (
            <>
              <div className="terms-copy" tabIndex={0} aria-label={`Terms and conditions, version ${terms?.version}`}>
                {terms?.terms_text}
              </div>
              <label className="terms-check">
                <input type="checkbox" checked={termsAccepted} disabled={busy}
                  onChange={(e) => { setTermsAccepted(e.target.checked); setTermsError(''); }} />
                <span>I have read and agree to the terms and conditions.</span>
              </label>
              {termsError && <p className="error-text" role="alert">{termsError}</p>}
            </>
          )}
        </section>
        {formError && <p className="banner error" role="alert">{formError}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn primary" style={{ '--accent': option.accent } as React.CSSProperties}
            disabled={busy || termsLoading || Boolean(termsLoadError) || !termsReady || !termsAccepted}>
            {busy ? <><Loader2 size={16} className="spin" /> Submitting</> : 'Submit request'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
