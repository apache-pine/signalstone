import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryState {
	failed: boolean;
}

/**
 * Catches rendering errors anywhere in the Signalstone tree so a display bug
 * produces a recoverable screen instead of blanking the whole sidebar.
 */
export class SignalstoneErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
	state: ErrorBoundaryState = { failed: false };

	static getDerivedStateFromError(): ErrorBoundaryState {
		return { failed: true };
	}

	componentDidCatch(_error: Error, _info: ErrorInfo): void {
		// Intentionally not logged: React error objects can echo component
		// props, which may include message content.
	}

	render(): ReactNode {
		if (!this.state.failed) return this.props.children;
		return (
			<section className="signalstone-empty">
				<h2>Signalstone encountered a display error</h2>
				<p>Your Webex data and draft have not been saved or sent elsewhere.</p>
				<button className="mod-cta" onClick={() => this.setState({ failed: false })}>
					Try again
				</button>
			</section>
		);
	}
}
