import { useState } from 'react';
import type { SignalstoneState, SignalstoneStore } from '../services/SignalstoneStore';
import { formatDate, realtimeLabel } from '../utils/format';

/** The "Recent" screen: connectivity status, local filtering, and the combined list of direct/group spaces. */
export function ConversationList({ state, store, onNewMessage }: { state: SignalstoneState; store: SignalstoneStore; onNewMessage: () => void }) {
	const [filter, setFilter] = useState('');
	const spaces = state.spaces.filter((space) => (space.title || 'Direct message').toLowerCase().includes(filter.toLowerCase()));

	return (
		<section className="signalstone-app">
			<header>
				<div>
					<h2>Signalstone</h2>
					<small className={`signalstone-status is-${state.realtime}`} title={state.realtimeDetail}>
						{realtimeLabel(state.realtime)}
						{state.realtime === 'degraded' && state.realtimeDetail ? ` · ${state.realtimeDetail}` : ''}
					</small>
				</div>
				<div className="signalstone-header-actions">
					<button onClick={onNewMessage} aria-label="Start a new message">
						＋
					</button>
					<button onClick={() => void store.loadSpaces()} aria-label="Refresh conversations">
						↻
					</button>
				</div>
			</header>
			<input className="signalstone-search" placeholder="Filter conversations" value={filter} onChange={(event) => setFilter(event.target.value)} />
			{state.error && (
				<div className="signalstone-error">
					<span>{state.error}</span>
					<button onClick={() => void store.loadSpaces()}>Retry</button>
				</div>
			)}
			<div className="signalstone-space-list">
				{spaces.map((space) => (
					<button key={space.id} onClick={() => void store.selectSpace(space.id)}>
						<span>{space.title || (space.type === 'direct' ? 'Direct message' : 'Unnamed space')}</span>
						<small>
							{space.type === 'direct' ? 'Direct message' : 'Group space'} · {formatDate(space.lastActivity)}
						</small>
					</button>
				))}
				{!state.loading && !state.error && spaces.length === 0 && (
					<div className="signalstone-empty-list">
						<p>{filter ? 'No conversations match your filter.' : 'No Webex conversations were found.'}</p>
					</div>
				)}
			</div>
			{state.loading && (
				<p className="signalstone-loading" role="status">
					Loading conversations…
				</p>
			)}
		</section>
	);
}
