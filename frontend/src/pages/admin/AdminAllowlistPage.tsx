import { type FormEvent, useCallback, useEffect, useState } from 'react';
import {
  deleteSettlementAllowlist,
  getSettlementAllowlist,
  upsertSettlementAllowlist,
} from '../../api/admin';
import type { SettlementAllowlistEntry } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ErrorAlert } from '../../components/ErrorAlert';

export function AdminAllowlistPage() {
  const { token } = useAuth();
  const [entries, setEntries] = useState<SettlementAllowlistEntry[]>([]);
  const [envSteamIds, setEnvSteamIds] = useState<string[]>([]);
  const [steamId, setSteamId] = useState('');
  const [note, setNote] = useState('');
  const [maxOrderMinor, setMaxOrderMinor] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    if (!token) {
      return Promise.resolve();
    }
    return getSettlementAllowlist(token)
      .then((response) => {
        setEntries(response.entries);
        setEnvSteamIds(response.envSteamIds);
      })
      .catch((err: unknown) => setError(err));
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [token, load]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token || !steamId.trim()) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await upsertSettlementAllowlist(token, steamId.trim(), {
        enabled: true,
        note: note.trim() || undefined,
        maxOrderMinor: maxOrderMinor.trim() || undefined,
      });
      setSteamId('');
      setNote('');
      setMaxOrderMinor('');
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entrySteamId: string) {
    if (!token || !window.confirm(`Remove ${entrySteamId} from allowlist?`)) {
      return;
    }
    setError(null);
    try {
      await deleteSettlementAllowlist(token, entrySteamId);
      await load();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Settlement allowlist</h2>
          <p className="muted">
            Policy: both buyer and seller Steam IDs must be allowlisted for real settlement.
          </p>
        </div>
      </div>

      {loading ? <p className="muted">Loading allowlist…</p> : null}

      {envSteamIds.length > 0 ? (
        <section className="card admin-section">
          <h3>Env allowlist</h3>
          <p className="muted small">{envSteamIds.join(', ')}</p>
        </section>
      ) : null}

      <section className="card admin-section">
        <h3>Add / update entry</h3>
        <form className="stack" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field">
            <span>Steam ID</span>
            <input
              className="input"
              value={steamId}
              onChange={(event) => setSteamId(event.target.value)}
              placeholder="76561198..."
              data-testid="allowlist-steam-id"
            />
          </label>
          <label className="field">
            <span>Max order (minor, optional)</span>
            <input
              className="input"
              value={maxOrderMinor}
              onChange={(event) => setMaxOrderMinor(event.target.value)}
              placeholder="50000"
            />
          </label>
          <label className="field">
            <span>Note</span>
            <input
              className="input"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="staging tester"
            />
          </label>
          <button type="submit" className="button primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save entry'}
          </button>
        </form>
      </section>

      <section className="card admin-section">
        <h3>Database entries</h3>
        <div className="table-wrap">
          <table className="data-table" data-testid="allowlist-table">
            <thead>
              <tr>
                <th>Steam ID</th>
                <th>Enabled</th>
                <th>Max order</th>
                <th>Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.steamId}>
                  <td>{entry.steamId}</td>
                  <td>{entry.enabled ? 'yes' : 'no'}</td>
                  <td>{entry.maxOrderMinor ?? '—'}</td>
                  <td>{entry.note ?? '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => void handleDelete(entry.steamId)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ErrorAlert error={error} />
    </div>
  );
}
