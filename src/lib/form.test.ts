import { test, expect } from 'vitest';
import { formBoolean } from './form';

test.each([
  ['true', true],
  ['false', false],
  [undefined, false],
])('formBoolean(%s) は %s', (input, expected) => {
  expect(formBoolean.parse(input)).toBe(expected);
});
