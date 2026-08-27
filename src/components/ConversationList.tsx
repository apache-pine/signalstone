import { useState } from 'react';
import type { SignalstoneState, SignalstoneStore } from '../services/SignalstoneStore';
import { formatDate, realtimeLabel } from '../utils/format';
import { presenceInfo } from '../utils/presence';

/** The "Recent" screen: connectivity status, local filtering, and the combined list of direct/group spaces. */
export function ConversationList({ state, store, onNewMessage, onNewSpace }: { state: SignalstoneState; store: SignalstoneStore; onNewMessage: () => void; onNewSpace: () => void }) {
	const [filter, setFilter] = useState('');
	const filtered = state.spaces.filter((space) => (space.title || 'Direct message').toLowerCase().includes(filter.toLowerCase()));
	// state.spaces is already sorted by most-recent activity (see SignalstoneStore.loadSpaces);
	// 'alphabetical' is the only case that needs re-sorting here.
	const spaces = state.settings.spaceSortOrder === 'alphabetical' ? [...filtered].sort((a, b) => (a.title || 'Direct message').localeCompare(b.title || 'Direct message')) : filtered;

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
					<button onClick={onNewSpace} aria-label="Create a new space">
						👥
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
				{spaces.map((space) => {
					const isDirect = space.type === 'direct';
					const info = isDirect ? state.directoryInfoBySpaceId[space.id] : undefined;
					const presence = isDirect && state.settings.showPresenceInRecents ? presenceInfo(info?.status) : undefined;
					return (
						<button key={space.id} onClick={() => void store.selectSpace(space.id)}>
							{isDirect && state.settings.showAvatarsInRecents && info?.avatar && <img className="signalstone-avatar" src={info.avatar} alt="" loading="lazy" />}
							<div>
								<span>
									<span className="signalstone-space-title">{space.title || (space.type === 'direct' ? 'Direct message' : 'Unnamed space')}</span>
									{presence && <span className={`signalstone-presence is-${presence.category}`} title={presence.label} aria-label={presence.label} />}
								</span>
								<small>
									{space.type === 'direct' ? 'Direct message' : 'Group space'} · {formatDate(space.lastActivity, state.settings.timeFormat)}
								</small>
							</div>
						</button>
					);
				})}
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
