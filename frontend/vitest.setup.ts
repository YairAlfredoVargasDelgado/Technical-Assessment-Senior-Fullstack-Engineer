import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// React Testing Library does not unmount between tests automatically when
// `globals: true` is used with an explicit setup file. Without this, a test can
// observe DOM left behind by its predecessor and pass for the wrong reason.
afterEach(() => {
  cleanup();
});
