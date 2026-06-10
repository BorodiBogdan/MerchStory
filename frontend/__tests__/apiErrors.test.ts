import { GalleryNameConflictError, InsufficientCreditsError } from '../utils/api';

describe('InsufficientCreditsError', () => {
  it('is an Error with a fixed name and message', () => {
    const err = new InsufficientCreditsError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('InsufficientCreditsError');
    expect(err.message).toBe('Insufficient credits');
  });
});

describe('GalleryNameConflictError', () => {
  it('defaults its message and exposes its name', () => {
    const err = new GalleryNameConflictError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('GalleryNameConflictError');
    expect(err.message).toBe('You already have an image with that name.');
  });

  it('accepts a custom message', () => {
    const err = new GalleryNameConflictError('Name taken');
    expect(err.message).toBe('Name taken');
    expect(err.name).toBe('GalleryNameConflictError');
  });
});
