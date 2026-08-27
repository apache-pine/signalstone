/**
 * Minimal, safe text rendering: inline code spans and bare http(s) links.
 * Deliberately does not parse arbitrary HTML/Markdown into the DOM — every
 * node here is a React element built from plain string parts, so there is no
 * `dangerouslySetInnerHTML` and no way for remote message content to inject
 * markup or scripts.
 */
export function renderText(text: string) {
	return text.split(/(`[^`]+`|https?:\/\/[^\s]+)/g).map((part, index) => {
		if (part.startsWith('`') && part.endsWith('`')) {
			return <code key={index}>{part.slice(1, -1)}</code>;
		}
		if (/^https?:\/\//.test(part)) {
			return (
				<a key={index} href={part} rel="noopener noreferrer">
					{part}
				</a>
			);
		}
		return <span key={index}>{part}</span>;
	});
}
