import { useEffect, useState } from 'react';
import type { Membership } from '../models/Membership';
import type { SignalstoneStore } from '../services/SignalstoneStore';
import { errorMessage } from '../utils/format';

type LoadStatus = 'loading' | 'ready' | 'error';

/**
 * Compact member view for a group space: name, email, moderator status, and
 * a self indicator, with invite/remove/moderator actions. Webex enforces who
 * may actually perform these actions server-side — a failed action surfaces
 * the resulting WebexError rather than Signalstone guessing permissions.
 */
export function MemberList({ spaceId, selfId, store, onClose }: { spaceId: string; selfId: string; store: SignalstoneStore; onClose: () => void }) {
	const [status, setStatus] = useState<LoadStatus>('loading');
	const [members, setMembers] = useState<Membership[]>([]);
	const [error, setError] = useState('');
	const [addEmail, setAddEmail] = useState('');
	const [addBusy, setAddBusy] = useState(false);
	const [addError, setAddError] = useState('');
	const [busyMembershipId, setBusyMembershipId] = useState<string>();
	const [confirmingRemoveId, setConfirmingRemoveId] = useState<string>();
	const [confirmingLeave, setConfirmingLeave] = useState(false);
	const [leaving, setLeaving] = useState(false);
	const [leaveError, setLeaveError] = useState('');

	const load = async () => {
		setStatus('loading');
		setError('');
		try {
			setMembers(await store.listMembers(spaceId));
			setStatus('ready');
		} catch (reason) {
			setError(errorMessage(reason, 'Unable to load members from Webex.'));
			setStatus('error');
		}
	};

	useEffect(() => {
		void load();
		// load is intentionally excluded: it is redefined each render but only
		// ever needs to run again when the space being viewed changes.
	}, [spaceId]);

	const addMember = async () => {
		const email = addEmail.trim();
		if (!email) return;
		setAddBusy(true);
		setAddError('');
		try {
			await store.addMember(spaceId, email);
			setAddEmail('');
			await load();
		} catch (reason) {
			setAddError(errorMessage(reason, 'Unable to add that person.'));
		} finally {
			setAddBusy(false);
		}
	};

	const toggleModerator = async (member: Membership) => {
		setBusyMembershipId(member.id);
		try {
			await store.setModerator(member.id, !member.isModerator);
			await load();
		} catch (reason) {
			setError(errorMessage(reason, 'Unable to update moderator status.'));
		} finally {
			setBusyMembershipId(undefined);
		}
	};

	const leaveSpace = async () => {
		setLeaving(true);
		setLeaveError('');
		try {
			await store.leaveSpace(spaceId);
			// No further navigation needed here: leaving clears selectedSpaceId
			// in the store, and the router (SignalstoneApp) reacts to that on its
			// own by returning to the conversation list.
		} catch (reason) {
			setLeaveError(errorMessage(reason, 'Unable to leave this space.'));
			setConfirmingLeave(false);
			setLeaving(false);
		}
	};

	const removeMember = async (member: Membership) => {
		setBusyMembershipId(member.id);
		try {
			await store.removeMember(member.id);
			setConfirmingRemoveId(undefined);
			await load();
		} catch (reason) {
			setError(errorMessage(reason, 'Unable to remove that member.'));
		} finally {
			setBusyMembershipId(undefined);
		}
	};

	return (
		<section className="signalstone-app signalstone-members">
			<header>
				<button onClick={onClose} aria-label="Back to conversation">
					←
				</button>
				<h2>Members</h2>
			</header>
			<div className="signalstone-members-body">
				<div className="signalstone-add-member">
					<input
						value={addEmail}
						onChange={(event) => setAddEmail(event.target.value)}
						placeholder="Add by email"
						aria-label="Add a member by email"
						onKeyDown={(event) => {
							if (event.key === 'Enter') void addMember();
						}}
					/>
					<button onClick={() => void addMember()} disabled={addBusy || !addEmail.trim()}>
						{addBusy ? 'Adding…' : 'Add'}
					</button>
				</div>
				{addError && <p className="signalstone-form-error">{addError}</p>}
				{status === 'loading' && (
					<p className="signalstone-loading" role="status">
						Loading members…
					</p>
				)}
				{status === 'error' && (
					<div className="signalstone-error">
						<span>{error}</span>
						<button onClick={() => void load()}>Retry</button>
					</div>
				)}
				{status === 'ready' && (
					<ul className="signalstone-member-list">
						{members.map((member) => {
							const isSelf = member.personId === selfId;
							const busy = busyMembershipId === member.id;
							return (
								<li key={member.id} className={isSelf ? 'is-self' : ''}>
									<div>
										<strong>
											{member.personDisplayName || member.personEmail}
											{isSelf ? ' (you)' : ''}
										</strong>
										<small>
											{member.personEmail}
											{member.isModerator ? ' · Moderator' : ''}
										</small>
									</div>
									{!isSelf && (
										<div className="signalstone-member-actions">
											<button disabled={busy} onClick={() => void toggleModerator(member)}>
												{member.isModerator ? 'Remove moderator' : 'Make moderator'}
											</button>
											{confirmingRemoveId === member.id ? (
												<>
													<button disabled={busy} onClick={() => setConfirmingRemoveId(undefined)}>
														Cancel
													</button>
													<button className="mod-warning" disabled={busy} onClick={() => void removeMember(member)}>
														Confirm remove
													</button>
												</>
											) : (
												<button disabled={busy} onClick={() => setConfirmingRemoveId(member.id)}>
													Remove
												</button>
											)}
										</div>
									)}
								</li>
							);
						})}
					</ul>
				)}
				{error && status !== 'error' && <p className="signalstone-form-error">{error}</p>}
				<div className="signalstone-leave-space">
					{leaveError && <p className="signalstone-form-error">{leaveError}</p>}
					{confirmingLeave ? (
						<>
							<button disabled={leaving} onClick={() => setConfirmingLeave(false)}>
								Cancel
							</button>
							<button className="mod-warning" disabled={leaving} onClick={() => void leaveSpace()}>
								{leaving ? 'Leaving…' : 'Confirm leave'}
							</button>
						</>
					) : (
						<button className="mod-warning" onClick={() => setConfirmingLeave(true)}>
							Leave this space
						</button>
					)}
				</div>
			</div>
		</section>
	);
}
