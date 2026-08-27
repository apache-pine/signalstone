import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderWebexMarkdown } from '../src/utils/webexMarkdown';
import { toWebexMarkdown } from '../src/utils/format';

function renderMarkdown(text: string) {
	return render(<div data-testid="root">{renderWebexMarkdown(text)}</div>);
}

describe('renderWebexMarkdown', () => {
	it('renders bold and italic text', () => {
		renderMarkdown('**Status:** Closed and *the best* launch');
		expect(screen.getByText('Status:').tagName).toBe('STRONG');
		expect(screen.getByText('the best').tagName).toBe('EM');
	});

	it('renders inline code without treating its contents as markdown', () => {
		renderMarkdown('the `hasPermission` function');
		expect(screen.getByText('hasPermission').tagName).toBe('CODE');
	});

	it('renders a fenced code block, preserving internal newlines literally', () => {
		const { container } = renderMarkdown('```\nline one\nline two\n```');
		const code = container.querySelector('pre code');
		expect(code?.textContent).toBe('line one\nline two');
	});

	it('renders a markdown link with its own text, and a bare URL using the URL as its text', () => {
		renderMarkdown('[Oh yea!](http://example.com/polls/1) or just http://example.com/bare');
		const namedLink = screen.getByRole('link', { name: 'Oh yea!' });
		expect(namedLink).toHaveAttribute('href', 'http://example.com/polls/1');
		const bareLink = screen.getByRole('link', { name: 'http://example.com/bare' });
		expect(bareLink).toHaveAttribute('href', 'http://example.com/bare');
	});

	it('renders an unordered list with nested sub-items', () => {
		const { container } = renderMarkdown('* Buy a new shirt.\n  * With buttons.\n    * And a collar!');
		expect(container.querySelectorAll('ul li').length).toBe(3);
		const nested = container.querySelector('li > ul > li');
		expect(nested?.textContent).toContain('With buttons.');
	});

	it('renders an ordered list', () => {
		const { container } = renderMarkdown('1. Collect Underpants\n2. ???\n3. Profit');
		const list = container.querySelector('ol');
		expect(list).not.toBeNull();
		expect(list?.querySelectorAll('li').length).toBe(3);
	});

	it('renders a blockquote', () => {
		const { container } = renderMarkdown("Alice said:\n> I don't care what it costs.");
		expect(container.querySelector('blockquote')?.textContent).toContain("don't care what it costs");
	});

	it('renders a person mention using its display name, not the raw markup', () => {
		renderMarkdown('Hi <@personEmail:banderson@example.com|Bobby>, your order shipped.');
		const mention = screen.getByText('@Bobby');
		expect(mention.className).toContain('signalstone-mention');
	});

	it('renders an @all mention', () => {
		renderMarkdown('<@all>, exciting news!');
		expect(screen.getByText('@all').className).toContain('signalstone-mention');
	});

	it('renders a <spark-mention> tag, which is what Webex actually returns for a mention once processed (confirmed via live testing, not just docs)', () => {
		renderMarkdown(
			'<spark-mention data-object-type="person" data-object-id="Y2lzY29zcGFyazovL3VzL1BFT1BMRS8yN2VmNTEwMi0zMDVmLTQxOWItODk3Yi00ZmIyN2E1NmI1MjQ">Anthony Perez</spark-mention>  this is a test',
		);
		const mention = screen.getByText('@Anthony Perez');
		expect(mention.className).toContain('signalstone-mention');
		expect(mention.tagName).toBe('SPAN');
	});

	it('treats a line ending in two spaces as a hard break, and a bare newline as a soft join', () => {
		const { container } = renderMarkdown('Line 1  \nLine 2\nLine 3');
		const paragraph = container.querySelector('p');
		expect(paragraph?.querySelectorAll('br').length).toBe(1);
		expect(paragraph?.textContent).toBe('Line 1Line 2 Line 3');
	});

	it('never renders remote content as executable markup: a literal script tag stays visible text, not a DOM element', () => {
		const { container } = renderMarkdown('<script>alert(1)</script> and <img src=x onerror="alert(1)">');
		expect(container.querySelector('script')).toBeNull();
		expect(container.querySelector('img')).toBeNull();
		expect(container.textContent).toContain('<script>alert(1)</script>');
		expect(container.textContent).toContain('onerror="alert(1)"');
	});
});

describe('toWebexMarkdown', () => {
	it('turns every newline into a Webex hard line break', () => {
		expect(toWebexMarkdown('line one\nline two')).toBe('line one  \nline two');
	});

	it('normalizes pre-existing trailing whitespace rather than stacking more onto it', () => {
		expect(toWebexMarkdown('line one   \nline two')).toBe('line one  \nline two');
	});
});
