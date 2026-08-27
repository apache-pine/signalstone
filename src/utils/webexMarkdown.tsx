import { Fragment, type ReactNode } from 'react';

/**
 * Renders the documented Webex Markdown subset (bold, italic, links, ordered
 * and unordered lists with nested sub-items, blockquotes, inline code,
 * fenced code blocks, mentions) as plain React elements — never HTML. There
 * is no `dangerouslySetInnerHTML` anywhere in this file and no parsing step
 * that produces an HTML string, so remote message content has no path to
 * inject markup, scripts, or event handlers.
 *
 * Deliberately does not implement Obsidian-flavored Markdown (wikilinks,
 * embeds, callouts, tags, etc.) — those aren't part of Webex's Markdown and
 * rendering them here would both misrepresent messages that happen to
 * contain `[[...]]`-shaped text and, for embeds specifically, open a path
 * for remote message content to reference the user's own vault.
 *
 * Reference: https://developer.webex.com/formatting-messages.html
 */

interface ListNode {
	text: string;
	children: ListNode[];
}

type Block =
	| { type: 'code'; content: string }
	| { type: 'quote'; text: string }
	| { type: 'list'; ordered: boolean; items: ListNode[] }
	| { type: 'paragraph'; text: string };

const LIST_ITEM_PATTERN = /^\s*(?:[*-]|\d+[.)])\s+/;
const LIST_MARKER_PATTERN = /^(?:[*-]|\d+[.)])\s+/;
const ORDERED_ITEM_PATTERN = /^\d+[.)]\s/;
const QUOTE_PATTERN = /^>\s?/;

// Inline tokens, tried in this order (bold before italic, since `**` would
// otherwise partially match the single-asterisk italic pattern first).
//
// Mentions appear in two different forms depending on where the text came
// from. `<@personEmail:...|Name>` / `<@personId:...|Name>` / `<@all>` is
// the documented syntax for *sending* a mention through the `markdown`
// field. Once Webex has processed a message, live testing shows it stores
// and returns mentions rewritten as its own
// `<spark-mention data-object-type="..." data-object-id="...">Name</spark-mention>`
// tag instead — including in the response to Signalstone's own send call —
// so that's what actually needs to be recognized when *rendering* a
// message, not just the documented send-time syntax. Both are handled;
// `<spark-mention>` has no capturing group here (it's matched as one opaque
// token) so it doesn't disturb the single-capture-group split() below —
// its inner text is pulled out separately in renderInline.
const INLINE_PATTERN =
	/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\)|<@(?:personEmail|personId):[^|>]+\|[^>]+>|<@all>|<spark-mention[^>]*>[^<]*<\/spark-mention>|https?:\/\/\S+)/g;

export function renderWebexMarkdown(text: string): ReactNode {
	const blocks = splitBlocks(text);
	return (
		<>
			{blocks.map((block, index) => {
				const key = `b${index}`;
				if (block.type === 'code') {
					return (
						<pre key={key}>
							<code>{block.content}</code>
						</pre>
					);
				}
				if (block.type === 'quote') {
					return <blockquote key={key}>{renderParagraphLines(block.text, key)}</blockquote>;
				}
				if (block.type === 'list') {
					return renderList(block.ordered, block.items, key);
				}
				return <p key={key}>{renderParagraphLines(block.text, key)}</p>;
			})}
		</>
	);
}

function splitBlocks(source: string): Block[] {
	const lines = source.split('\n');
	const blocks: Block[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i] ?? '';

		if (line.trim().length === 0) {
			i += 1;
			continue;
		}

		if (line.trim().startsWith('```')) {
			const codeLines: string[] = [];
			i += 1;
			while (i < lines.length && !(lines[i] ?? '').trim().startsWith('```')) {
				codeLines.push(lines[i] ?? '');
				i += 1;
			}
			i += 1; // skip the closing fence, if present
			blocks.push({ type: 'code', content: codeLines.join('\n') });
			continue;
		}

		if (QUOTE_PATTERN.test(line)) {
			const quoteLines: string[] = [];
			while (i < lines.length && QUOTE_PATTERN.test(lines[i] ?? '')) {
				quoteLines.push((lines[i] ?? '').replace(QUOTE_PATTERN, ''));
				i += 1;
			}
			blocks.push({ type: 'quote', text: quoteLines.join('\n') });
			continue;
		}

		if (LIST_ITEM_PATTERN.test(line)) {
			const listLines: string[] = [];
			while (i < lines.length && LIST_ITEM_PATTERN.test(lines[i] ?? '')) {
				listLines.push(lines[i] ?? '');
				i += 1;
			}
			blocks.push({ type: 'list', ...parseListItems(listLines) });
			continue;
		}

		const paragraphLines: string[] = [];
		while (i < lines.length && (lines[i] ?? '').trim().length > 0 && !QUOTE_PATTERN.test(lines[i] ?? '') && !(lines[i] ?? '').trim().startsWith('```') && !LIST_ITEM_PATTERN.test(lines[i] ?? '')) {
			paragraphLines.push(lines[i] ?? '');
			i += 1;
		}
		blocks.push({ type: 'paragraph', text: paragraphLines.join('\n') });
	}

	return blocks;
}

/**
 * Builds a nested list tree from indentation, per Webex's documented
 * convention of two spaces per level ("Add two spaces before the `*` or
 * `-` for each level of indentation"). All levels share the top item's
 * ordered/unordered type — Webex's own nesting example only ever nests one
 * marker type under itself, and mixed-type nesting in a chat message is
 * vanishingly rare.
 */
function parseListItems(lines: string[]): { ordered: boolean; items: ListNode[] } {
	const ordered = ORDERED_ITEM_PATTERN.test((lines[0] ?? '').trimStart());
	const root: ListNode[] = [];
	const stack: { level: number; items: ListNode[] }[] = [{ level: -1, items: root }];

	for (const rawLine of lines) {
		const leading = rawLine.match(/^ */)?.[0].length ?? 0;
		const level = Math.floor(leading / 2);
		const text = rawLine.trim().replace(LIST_MARKER_PATTERN, '');
		const node: ListNode = { text, children: [] };

		while (stack.length > 1 && (stack[stack.length - 1]?.level ?? -1) >= level) stack.pop();
		stack[stack.length - 1]?.items.push(node);
		stack.push({ level, items: node.children });
	}

	return { ordered, items: root };
}

function renderList(ordered: boolean, items: ListNode[], keyPrefix: string): ReactNode {
	const items_ = items.map((item, index) => {
		const itemKey = `${keyPrefix}-${index}`;
		return (
			<li key={itemKey}>
				{renderInline(item.text, itemKey)}
				{item.children.length > 0 && renderList(ordered, item.children, itemKey)}
			</li>
		);
	});
	return ordered ? <ol key={keyPrefix}>{items_}</ol> : <ul key={keyPrefix}>{items_}</ul>;
}

/**
 * Within a block, a line ending in two-or-more spaces is a hard line break;
 * a bare newline is just a soft join (rendered as a space), matching
 * Webex's documented paragraph/line-break rules exactly, so a message
 * renders the same way here as it does in any other Webex client.
 */
function renderParagraphLines(text: string, keyPrefix: string): ReactNode {
	const lines = text.split('\n');
	const nodes: ReactNode[] = [];

	lines.forEach((line, index) => {
		const isHardBreak = / {2,}$/.test(line);
		const lineKey = `${keyPrefix}-l${index}`;
		nodes.push(<Fragment key={lineKey}>{renderInline(line.replace(/ +$/, ''), lineKey)}</Fragment>);
		if (index < lines.length - 1) {
			nodes.push(isHardBreak ? <br key={`${lineKey}-br`} /> : ' ');
		}
	});

	return nodes;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
	return text
		.split(INLINE_PATTERN)
		.filter((part) => part.length > 0)
		.map((part, index) => {
			const key = `${keyPrefix}-i${index}`;

			if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
				return <code key={key}>{part.slice(1, -1)}</code>;
			}
			if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
				return <strong key={key}>{part.slice(2, -2)}</strong>;
			}
			if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
				return <em key={key}>{part.slice(1, -1)}</em>;
			}

			const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
			if (link?.[1] && link[2]) {
				return (
					<a key={key} href={link[2]} rel="noopener noreferrer">
						{link[1]}
					</a>
				);
			}

			const mention = /^<@(?:personEmail|personId):[^|>]+\|([^>]+)>$/.exec(part);
			if (mention?.[1]) {
				return (
					<span key={key} className="signalstone-mention">
						@{mention[1]}
					</span>
				);
			}
			if (part === '<@all>') {
				return (
					<span key={key} className="signalstone-mention">
						@all
					</span>
				);
			}

			const sparkMention = /^<spark-mention[^>]*>([^<]*)<\/spark-mention>$/.exec(part);
			if (sparkMention) {
				return (
					<span key={key} className="signalstone-mention">
						@{sparkMention[1]}
					</span>
				);
			}

			if (/^https?:\/\//.test(part)) {
				return (
					<a key={key} href={part} rel="noopener noreferrer">
						{part}
					</a>
				);
			}

			return <span key={key}>{part}</span>;
		});
}
