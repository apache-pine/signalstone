import { useState } from 'react';
import type { Person } from '../models/Person';
import type { SignalstoneStore } from '../services/SignalstoneStore';
import { errorMessage } from '../utils/format';
import { isValidEmail } from '../utils/email';
import { presenceInfo } from '../utils/presence';

interface PendingMember {
	email: string;
	label: string;
}

/** Creates a new group space: a title, and any number of members added by directory search or exact email, added best-effort once the space exists. */
export function NewSpace({ store, onClose }: { store: SignalstoneStore; onClose: () => void }) {
	const [title, setTitle] = useState('');
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<Person[]>([]);
	const [members, setMembers] = useState<PendingMember[]>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	const search = async () => {
		setBusy(true);
		setError('');
		try {
			setResults(await store.searchPeople(query));
		} catch {
			setResults([]);
			setError('Directory search is unavailable. You can still add an exact email address.');
		} finally {
			setBusy(false);
		}
	};

	const addMember = (member: PendingMember) => {
		if (members.some((existing) => existing.email === member.email)) return;
		setMembers((prev) => [...prev, member]);
		setQuery('');
		setResults([]);
	};

	const removeMember = (email: string) => setMembers((prev) => prev.filter((member) => member.email !== email));

	const create = async () => {
		if (!title.trim()) return;
		setBusy(true);
		setError('');
		try {
			const { failedMemberEmails } = await store.createSpace(title, members.map((member) => member.email));
			if (failedMemberEmails.length > 0) {
				// The space was still created and selected; surface this as a
				// non-blocking heads-up rather than treating it as a failure.
				setError(`Space created, but could not add: ${failedMemberEmails.join(', ')}`);
				setBusy(false);
				return;
			}
			onClose();
		} catch (reason) {
			setError(errorMessage(reason, 'Unable to create this space.'));
			setBusy(false);
		}
	};

	const exactEmail = isValidEmail(query);

	return (
		<section className="signalstone-app signalstone-new-message">
			<header>
				<button onClick={onClose} aria-label="Back to conversations">
					←
				</button>
				<h2>New space</h2>
			</header>
			<div className="signalstone-new-message-body">
				<label>
					Space name
					<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Project Kickoff" />
				</label>
				<label>
					Add members (optional — you can also add people later)
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Name or exact email"
						onKeyDown={(event) => {
							if (event.key === 'Enter') void search();
						}}
					/>
				</label>
				<button onClick={() => void search()} disabled={busy || query.trim().length < 2}>
					{busy ? 'Searching…' : 'Search'}
				</button>
				{error && <p className="signalstone-form-error">{error}</p>}
				<div className="signalstone-people-results">
					{results.map((person) => {
						const presence = presenceInfo(person.status);
						return (
							<button key={person.id} onClick={() => addMember({ email: person.emails[0] ?? '', label: person.displayName })}>
								{person.avatar && <img className="signalstone-avatar" src={person.avatar} alt="" loading="lazy" />}
								<div>
									<div className="signalstone-person-name">
										<strong>{person.displayName}</strong>
										{presence && <span className={`signalstone-presence is-${presence.category}`} title={presence.label} aria-label={presence.label} />}
									</div>
									<small>{person.emails[0] || 'Webex user'}</small>
								</div>
							</button>
						);
					})}
					{exactEmail && (
						<button onClick={() => addMember({ email: query.trim(), label: query.trim() })}>
							<strong>Add {query.trim()}</strong>
							<small>Exact email address</small>
						</button>
					)}
				</div>
				{members.length > 0 && (
					<ul className="signalstone-member-list">
						{members.map((member) => (
							<li key={member.email}>
								<div>
									<strong>{member.label}</strong>
									{member.label !== member.email && <small>{member.email}</small>}
								</div>
								<button onClick={() => removeMember(member.email)} aria-label={`Remove ${member.label}`}>
									×
								</button>
							</li>
						))}
					</ul>
				)}
				<button className="mod-cta" disabled={busy || !title.trim()} onClick={() => void create()}>
					{busy ? 'Creating…' : 'Create space'}
				</button>
			</div>
		</section>
	);
}
