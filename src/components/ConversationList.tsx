import { useState } from 'react';
import type { SignalstoneState, SignalstoneStore } from '../services/SignalstoneStore';
import { formatDate, realtimeLabel } from '../utils/format';
import { presenceInfo } from '../utils/presence';
import { openSpaceContextMenu } from './spaceContextMenu';
import { showConfirmMenu } from './confirmMenu';

/** The "Recent" screen: connectivity status, local filtering, and the combined list of direct/group spaces. */
export function ConversationList({
	state,
	store,
	onNewMessage,
	onNewSpace,
	onOpenSpaceView,
}: {
	state: SignalstoneState;
	store: SignalstoneStore;
	onNewMessage: () => void;
	onNewSpace: () => void;
	/** Opens a space directly into its member panel or rename editor — used by the row context menu's "Manage members"/"Rename…" items. */
	onOpenSpaceView: (spaceId: string, view: 'members' | 'rename') => void;
}) {
	const [filter, setFilter] = useState('');
	const selfId = state.connection.status === 'connected' ? state.connection.person.id : '';
	const isFavorite = (spaceId: string) => state.settings.favoriteSpaceIds.includes(spaceId);
	const filtered = state.spaces.filter((space) => (space.title || 'Direct message').toLowerCase().includes(filter.toLowerCase()));
	// state.spaces is already sorted by most-recent activity (see SignalstoneStore.loadSpaces);
	// 'alphabetical' is the only case that needs re-sorting here.
	const ordered = state.settings.spaceSortOrder === 'alphabetical' ? [...filtered].sort((a, b) => (a.title || 'Direct message').localeCompare(b.title || 'Direct message')) : filtered;
	// A stable sort (guaranteed by spec since ES2019) partitions favorites to
	// the front without disturbing their relative order from the sort above —
	// favorites stay in recent/alphabetical order among themselves too.
	const spaces = [...ordered].sort((a, b) => Number(isFavorite(b.id)) - Number(isFavorite(a.id)));
	const totalUnread = Object.values(state.unreadMessageIdsBySpace).reduce((sum, ids) => sum + ids.length, 0);

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
					{state.settings.showMarkAllReadButton && (
						<button
							className="signalstone-mark-all-read"
							onClick={(event) => showConfirmMenu(event.nativeEvent, `Mark all ${totalUnread} unread message${totalUnread === 1 ? '' : 's'} as read, across every conversation?`, 'Mark all as read', () => store.markAllAsRead())}
							disabled={totalUnread === 0}
							aria-label="Mark all conversations as read"
							title={totalUnread > 0 ? 'Mark all conversations as read' : 'Nothing to mark as read'}
						>
							✓
						</button>
					)}
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
					const isHidden = Boolean(state.hiddenSpaceIds[space.id]);
					const favorited = isFavorite(space.id);
					const info = isDirect ? state.directoryInfoBySpaceId[space.id] : undefined;
					const presence = isDirect && state.settings.showPresenceInRecents ? presenceInfo(info?.status) : undefined;
					const unreadCount = state.settings.showUnreadBadgeInRecents ? (state.unreadMessageIdsBySpace[space.id]?.length ?? 0) : 0;
					return (
						<button
							key={space.id}
							className={isHidden ? 'is-hidden' : ''}
							onClick={() => void store.selectSpace(space.id)}
							onContextMenu={(event) => {
								event.preventDefault();
								openSpaceContextMenu(event.nativeEvent, space, { selfId, isHidden, isFavorite: favorited, store, onOpenView: onOpenSpaceView });
							}}
						>
							{isDirect && state.settings.showAvatarsInRecents && info?.avatar && <img className="signalstone-avatar" src={info.avatar} alt="" loading="lazy" />}
							<div>
								<span>
									{favorited && (
										<span className="signalstone-favorite-star" aria-label="Favorited" title="Favorited">
											★
										</span>
									)}
									<span className="signalstone-space-title">{space.title || (space.type === 'direct' ? 'Direct message' : 'Unnamed space')}</span>
									{presence && <span className={`signalstone-presence is-${presence.category}`} title={presence.label} aria-label={presence.label} />}
								</span>
								<small>
									{space.type === 'direct' ? 'Direct message' : 'Group space'} · {formatDate(space.lastActivity, state.settings.timeFormat)}
									{isHidden && ' · Hidden'}
								</small>
							</div>
							{unreadCount > 0 && (
								<span className="signalstone-unread-badge" aria-label={`${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`}>
									{unreadCount > 99 ? '99+' : unreadCount}
								</span>
							)}
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
