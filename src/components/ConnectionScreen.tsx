const CONNECTION_LABELS: Record<string, string> = {
	'not-configured': 'Connect a Webex token to get started.',
	connecting: 'Connecting to Webex…',
	'invalid-token': 'That token is invalid.',
	unauthorized: 'Your token has expired.',
	'network-unavailable': 'Webex is currently unreachable.',
};

/** Shown whenever there is no usable Webex connection yet (or it has failed). */
export function ConnectionScreen({ state, openSettings }: { state: string; openSettings: () => void }) {
	return (
		<section className="signalstone-empty">
			<h2>Signalstone</h2>
			<p>{CONNECTION_LABELS[state] ?? 'Connection required.'}</p>
			<button className="mod-cta" onClick={openSettings}>
				Open settings
			</button>
		</section>
	);
}
