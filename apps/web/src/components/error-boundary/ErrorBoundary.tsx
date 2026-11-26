import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RuntimeErrorPage } from '@/pages/errors';

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Catches render crashes and shows the runtime error page with retry. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('render crashed', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return <RuntimeErrorPage error={this.state.error} onRetry={(): void => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}
