import { floatsMatch } from './float-match.util';

describe('float-match.util', () => {
  it('matches floats within epsilon', () => {
    expect(floatsMatch('0.254319', '0.2543191')).toBe(true);
    expect(floatsMatch('0.254319', '0.255000')).toBe(false);
  });

  it('passes when expected float is absent', () => {
    expect(floatsMatch(null, '0.254319')).toBe(true);
  });
});
