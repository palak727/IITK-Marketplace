import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProductForm } from './productValidation.js';

const validForm = {
  name: 'Desk lamp',
  description: 'A working lamp.',
  category: 'others',
  new_price: '120',
  old_price: '',
  condition: 'Barely Used',
  defects: 'No defects',
};

test('product form validation accepts valid creation and edit values at price limits', () => {
  assert.deepEqual(validateProductForm({
    ...validForm,
    new_price: '1000000',
    old_price: '0',
  }), {});
});

test('product form validation rejects missing and out-of-range fields', () => {
  const errors = validateProductForm({
    ...validForm,
    name: ' ',
    description: ' '.repeat(3001),
    category: '',
    condition: 'Unknown',
    new_price: '1000001',
    old_price: '-1',
    defects: 'x'.repeat(101),
  });

  assert.deepEqual(Object.keys(errors).sort(), [
    'category',
    'condition',
    'defects',
    'description',
    'name',
    'new_price',
    'old_price',
  ]);
});

test('product form validation rejects short names, invalid numeric values and non-string defects', () => {
  const errors = validateProductForm({
    ...validForm,
    name: 'x',
    new_price: 'not a number',
    old_price: 'not a number',
    defects: ['not text'],
  });

  assert.ok(errors.name);
  assert.ok(errors.new_price);
  assert.ok(errors.old_price);
  assert.ok(errors.defects);
});

test('product form validation enforces the maximum name length', () => {
  const errors = validateProductForm({ ...validForm, name: 'x'.repeat(101) });
  assert.match(errors.name, /100 characters/);
});
