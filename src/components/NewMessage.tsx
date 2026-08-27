import { useState } from 'react';
import type { Person } from '../models/Person';
import type { SignalstoneStore } from '../services/SignalstoneStore';
import { errorMessage } from '../utils/format';
import { isValidEmail } from '../utils/email';

/** Directory search (by name or exact email) to start a new direct message. */
export function NewMessage({ store, onClose }: { store: SignalstoneStore; onClose: () => void }) {
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<Person[]>([]);
	const [recipient, setRecipient] = useState<Person | { email: string }>();
	const [draft, setDraft] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	const search = async () => {
		setBusy(true);
		setError('');
		try {
			setResults(await store.searchPeople(query));
		} catch {
			setResults([]);
			setError('Directory search is unavailable. You can still enter an exact email address.');
		} finally {
			setBusy(false);
		}
	};

	const send = async () => {
		if (!recipient || !draft.trim()) return;
		setBusy(true);
		setError('');
		try {
			await store.startDirectMessage(recipient, draft);
			onClose();
		} catch (reason) {
			setError(errorMessage(reason, 'Unable to start this direct message.'));
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
				<h2>New message</h2>
			</header>
			<div className="signalstone-new-message-body">
				<label>
					Find a person
					<input
						value={query}
						onChange={(event) => {
							setQuery(event.target.value);
							setRecipient(undefined);
						}}
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
					{results.map((person) => (
						<button className={recipient && 'id' in recipient && recipient.id === person.id ? 'is-selected' : ''} key={person.id} onClick={() => setRecipient(person)}>
							<strong>{person.displayName}</strong>
							<small>{person.emails[0] || 'Webex user'}</small>
						</button>
					))}
					{exactEmail && (
						<button className={recipient && 'email' in recipient ? 'is-selected' : ''} onClick={() => setRecipient({ email: query.trim() })}>
							<strong>Use {query.trim()}</strong>
							<small>Exact email address</small>
						</button>
					)}
				</div>
				{recipient && (
					<>
						<label>
							First message
							<textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message…" />
						</label>
						<button className="mod-cta" disabled={busy || !draft.trim()} onClick={() => void send()}>
							{busy ? 'Sending…' : 'Send message'}
						</button>
					</>
				)}
			</div>
		</section>
	);
}
