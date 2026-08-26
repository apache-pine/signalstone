import { Component, type ErrorInfo, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { SignalstoneStore } from '../services/SignalstoneStore';
import type { WebexMessage } from '../models/Message';

export function SignalstoneApp({ store, openSettings }: { store: SignalstoneStore; openSettings: () => void }) {
	return <SignalstoneErrorBoundary><SignalstoneContent store={store} openSettings={openSettings} /></SignalstoneErrorBoundary>;
}

function SignalstoneContent({ store, openSettings }: { store: SignalstoneStore; openSettings: () => void }) {
	const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
	const [filter, setFilter] = useState('');
	useEffect(() => { if (state.connection.status === 'connected' && state.spaces.length === 0) void store.loadSpaces(); }, [state.connection.status]);
	if (state.connection.status !== 'connected') return <Connection state={state.connection.status} openSettings={openSettings} />;
	const selected = state.spaces.find((space) => space.id === state.selectedSpaceId);
	if (selected) return <Conversation title={selected.title || 'Direct message'} state={state} store={store} selfId={state.connection.person.id} />;
	const spaces = state.spaces.filter((space) => (space.title || 'Direct message').toLowerCase().includes(filter.toLowerCase()));
	return <section className="signalstone-app"><header><div><h2>Signalstone</h2><small className={`signalstone-status is-${state.realtime}`}>{state.realtime === 'live' ? 'Live' : 'Polling'}</small></div><button onClick={() => void store.loadSpaces()} aria-label="Refresh conversations">↻</button></header><input className="signalstone-search" placeholder="Filter conversations" value={filter} onChange={(event) => setFilter(event.target.value)} />{state.error && <div className="signalstone-error"><span>{state.error}</span><button onClick={() => void store.loadSpaces()}>Retry</button></div>}<div className="signalstone-space-list">{spaces.map((space) => <button key={space.id} onClick={() => void store.selectSpace(space.id)}><span>{space.title || (space.type === 'direct' ? 'Direct message' : 'Unnamed space')}</span><small>{space.type === 'direct' ? space.otherPerson?.email || 'Direct message' : 'Group space'} · {formatDate(space.lastActivity)}</small></button>)}{!state.loading && !state.error && spaces.length === 0 && <div className="signalstone-empty-list"><p>{filter ? 'No conversations match your filter.' : 'No Webex conversations were found.'}</p></div>}</div>{state.loading && <p className="signalstone-loading" role="status">Loading conversations…</p>}</section>;
}

function Connection({ state, openSettings }: { state: string; openSettings: () => void }) {
	const labels: Record<string, string> = { 'not-configured': 'Connect a Webex token to get started.', connecting: 'Connecting to Webex…', 'invalid-token': 'That token is invalid.', unauthorized: 'Your token has expired.', 'network-unavailable': 'Webex is currently unreachable.' };
	return <section className="signalstone-empty"><h2>Signalstone</h2><p>{labels[state] ?? 'Connection required.'}</p><button className="mod-cta" onClick={openSettings}>Open settings</button></section>;
}

function Conversation({ title, state, store, selfId }: { title: string; state: ReturnType<SignalstoneStore['getSnapshot']>; store: SignalstoneStore; selfId: string }) {
	const [draft, setDraft] = useState(''); const [file, setFile] = useState<File>(); const [sending, setSending] = useState(false); const end = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const target = end.current;
		if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'end' });
	}, [state.messages.length]);
	const send = async () => { if (sending || (!draft.trim() && !file)) return; setSending(true); try { await store.send(draft, file); setDraft(''); setFile(undefined); } finally { setSending(false); } };
	return <section className="signalstone-app signalstone-conversation"><header><button onClick={() => void store.selectSpace(null)} aria-label="Back to conversations">←</button><h2>{title}</h2></header><div className="signalstone-messages">{state.nextMessagesUrl && <button className="signalstone-load-older" onClick={() => void store.loadOlder()} disabled={state.loading}>{state.loading ? 'Loading…' : 'Load older messages'}</button>}{!state.loading && state.messages.length === 0 && !state.error && <div className="signalstone-empty-list"><p>No messages yet.</p></div>}{state.messages.map((message) => <Message key={message.id} message={message} own={message.personId === selfId} onDelete={() => { if (confirm('Delete this message from Webex?')) void store.deleteMessage(message.id); }} />)}{state.error && <div className="signalstone-error"><span>{state.error}</span><button onClick={() => void store.selectSpace(state.selectedSpaceId)}>Retry</button></div>}<div ref={end} /></div><div className="signalstone-composer" onDrop={(event) => { event.preventDefault(); setFile(event.dataTransfer.files[0]); }} onDragOver={(event) => event.preventDefault()}>{file && <div className="signalstone-file"><span>{file.name}</span><small>{formatSize(file.size)}</small><button onClick={() => setFile(undefined)} aria-label="Remove attachment">×</button></div>}<textarea aria-label="Write a message" placeholder="Write a message…" value={draft} onChange={(event) => setDraft(event.target.value)} onPaste={(event) => { const pasted = event.clipboardData.files[0]; if (pasted) setFile(pasted); }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} /><div><label className="signalstone-attach" aria-label="Attach a file">📎<input type="file" onChange={(event) => setFile(event.target.files?.[0])} /></label><button className="mod-cta" disabled={sending || (!draft.trim() && !file)} onClick={() => void send()}>{sending ? 'Sending…' : 'Send'}</button></div></div></section>;
}

function Message({ message, own, onDelete }: { message: WebexMessage; own: boolean; onDelete: () => void }) {
	return <article className={`signalstone-message${own ? ' is-own' : ''}`}><div><strong>{own ? 'You' : message.personDisplayName || message.personEmail}</strong><time>{formatDate(message.created)}</time></div><div className="signalstone-message-text">{renderText(message.markdown || message.text || '')}</div>{message.files?.map((url) => <div className="signalstone-attachment" key={url}>📎 Authenticated Webex attachment</div>)}{message.isEdited && <small>(edited)</small>}{own && <button className="signalstone-delete" onClick={onDelete}>Delete</button>}</article>;
}

function renderText(text: string) { return text.split(/(`[^`]+`|https?:\/\/[^\s]+)/g).map((part, index) => part.startsWith('`') && part.endsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : /^https?:\/\//.test(part) ? <a key={index} href={part} rel="noopener noreferrer">{part}</a> : <span key={index}>{part}</span>); }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? '' : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
function formatSize(bytes: number) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

interface ErrorBoundaryState { failed: boolean; }
class SignalstoneErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
	state: ErrorBoundaryState = { failed: false };
	static getDerivedStateFromError(): ErrorBoundaryState { return { failed: true }; }
	componentDidCatch(_error: Error, _info: ErrorInfo): void { /* Avoid logging message content or credentials. */ }
	render(): ReactNode {
		if (!this.state.failed) return this.props.children;
		return <section className="signalstone-empty"><h2>Signalstone encountered a display error</h2><p>Your Webex data and draft have not been saved or sent elsewhere.</p><button className="mod-cta" onClick={() => this.setState({ failed: false })}>Try again</button></section>;
	}
}
