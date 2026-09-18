import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from '../App';

describe('application startup', () => {
  it('renders the loading state before an outlet has loaded', () => {
    expect(() => renderToString(<App />)).not.toThrow();
    expect(renderToString(<App />)).toContain('Checking your secure session');
  });
});
