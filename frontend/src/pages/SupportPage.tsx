import { PageHeader } from '../components/PageHeader';
import { SUPPORT_EMAIL } from '../utils/format';

export function SupportPage() {
  return (
    <div className="page">
      <PageHeader
        title="Поддержка"
        subtitle="Свяжитесь с командой R.I.P. Market по вопросам сделок и аккаунта."
      />

      <div className="card form-card support-card" data-testid="support-page">
        <p>
          Если у вас возникли проблемы с обменом в Steam, спором или выплатой — напишите нам.
          Укажите ID сделки и краткое описание ситуации.
        </p>
        <p className="muted small">
          Email:{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} data-testid="support-email-link">
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p className="muted small">
          Мы отвечаем в рабочие дни в течение 24 часов. Для срочных споров откройте сделку в
          разделе «Мои сделки» — при необходимости статус перейдёт в спор (DISPUTE).
        </p>
      </div>
    </div>
  );
}
