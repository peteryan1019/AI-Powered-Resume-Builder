import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';

/**
 * Providers installed into every unit test's TestBed.
 *
 * Components under test pull in the navbar and auth service, which issue an
 * HTTP call to /auth/me on construction. Without a testing HTTP backend that
 * becomes a real fetch against a relative URL, which fails in Node and surfaces
 * as an unhandled error unrelated to whatever the test was checking. The
 * testing backend intercepts those requests instead. Router providers are here
 * for the same reason: several templates use routerLink.
 */
export default [
  provideZonelessChangeDetection(),
  provideHttpClient(),
  provideHttpClientTesting(),
  provideRouter([]),
];
