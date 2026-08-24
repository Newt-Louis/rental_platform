import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import i18n from '@/lib/i18n';
import { reportClientError } from '@/lib/telemetry';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled application error', error, info);
    reportClientError({
      message: error.message,
      stack: error.stack,
      source: 'error-boundary',
    });
  }

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const t = (key: string) => i18n.t(key);

    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-6">
        <section className="max-w-md text-center space-y-4">
          <div className="text-5xl" aria-hidden="true">!</div>
          <h1 className="text-2xl font-semibold text-foreground">{t('common:messages.error')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('common:messages.errorLoad')}
          </p>
          <Button onClick={this.reload}>{t('common:messages.tryAgain')}</Button>
        </section>
      </main>
    );
  }
}
