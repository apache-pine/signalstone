import { useEffect, useState } from 'react';
import type { SignalstoneStore } from '../services/SignalstoneStore';
import { errorMessage, formatSize } from '../utils/format';

type AttachmentStatus = 'idle' | 'loading' | 'ready' | 'error';

interface AttachmentMetadata {
	filename: string;
	contentType: string;
	sizeBytes: number | null;
	kind: 'image' | 'file';
}

/**
 * A single Webex file attachment. Starts idle (not fetched) so opening a
 * conversation never eagerly downloads every attachment; fetching is an
 * explicit click. The object URL created for preview/download is revoked on
 * unmount and whenever it is replaced.
 */
export function AttachmentPreview({ url, store }: { url: string; store: SignalstoneStore }) {
	const [status, setStatus] = useState<AttachmentStatus>('idle');
	const [error, setError] = useState('Unable to retrieve attachment.');
	const [objectUrl, setObjectUrl] = useState<string>();
	const [metadata, setMetadata] = useState<AttachmentMetadata>();

	useEffect(
		() => () => {
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		},
		[objectUrl],
	);

	const load = async () => {
		setStatus('loading');
		try {
			const result = await store.fetchAttachment(url);
			const nextUrl = URL.createObjectURL(new Blob([result.data], { type: result.attachment.contentType }));
			setObjectUrl((previous) => {
				if (previous) URL.revokeObjectURL(previous);
				return nextUrl;
			});
			setMetadata(result.attachment);
			setStatus('ready');
		} catch (reason) {
			setError(errorMessage(reason, 'Unable to retrieve attachment.'));
			setStatus('error');
		}
	};

	if (status === 'idle') {
		return (
			<button className="signalstone-attachment" onClick={() => void load()}>
				📎 Load attachment
			</button>
		);
	}
	if (status === 'loading') {
		return (
			<div className="signalstone-attachment" role="status">
				Loading attachment…
			</div>
		);
	}
	if (status === 'error') {
		return (
			<div className="signalstone-attachment is-error">
				<span>{error}</span>
				<button onClick={() => void load()}>Retry</button>
			</div>
		);
	}
	if (!objectUrl || !metadata) return null;

	return (
		<div className="signalstone-received-file">
			{metadata.kind === 'image' && <img src={objectUrl} alt={metadata.filename} loading="lazy" />}
			<div>
				<span>{metadata.filename}</span>
				<small>{metadata.sizeBytes === null ? metadata.contentType : `${formatSize(metadata.sizeBytes)} · ${metadata.contentType}`}</small>
				<a href={objectUrl} download={metadata.filename}>
					Save
				</a>
			</div>
		</div>
	);
}
