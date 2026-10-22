import { CATEGORIES, CONDITIONS } from './api.js';

const MAX_PRODUCT_PRICE = 1000000;
const MAX_DESCRIPTION_LENGTH = 3000;

export const validateProductForm = (form) => {
  const errors = {};
  const name = typeof form.name === 'string' ? form.name.trim() : '';
  const description = typeof form.description === 'string' ? form.description.trim() : '';

  if (!name) errors.name = 'Item title is required.';
  else if (name.length < 2) errors.name = 'Item title must be at least 2 characters.';
  else if (name.length > 100) errors.name = 'Item title must be 100 characters or fewer.';

  if (!CATEGORIES.some(({ slug }) => slug === form.category)) errors.category = 'Choose a valid category.';
  if (!CONDITIONS.includes(form.condition)) errors.condition = 'Choose a valid condition.';

  if (!description) errors.description = 'Item description is required.';
  else if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Item description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;
  }

  const sellingPrice = typeof form.new_price === 'string' ? form.new_price.trim() : form.new_price;
  if (sellingPrice === '' || sellingPrice === null || sellingPrice === undefined || !Number.isFinite(Number(sellingPrice))) {
    errors.new_price = 'Enter a valid selling price.';
  } else if (Number(sellingPrice) < 0 || Number(sellingPrice) > MAX_PRODUCT_PRICE) {
    errors.new_price = 'Selling price must be between ₹0 and ₹10,00,000.';
  }

  const oldPrice = typeof form.old_price === 'string' ? form.old_price.trim() : form.old_price;
  if (oldPrice !== '' && oldPrice !== null && oldPrice !== undefined) {
    if (!Number.isFinite(Number(oldPrice))) errors.old_price = 'Enter a valid original price.';
    else if (Number(oldPrice) < 0 || Number(oldPrice) > MAX_PRODUCT_PRICE) {
      errors.old_price = 'Original price must be between ₹0 and ₹10,00,000.';
    }
  }

  if (typeof form.defects !== 'string') errors.defects = 'Defects must be entered as text.';
  else if (form.defects.length > 100) errors.defects = 'Defects must be 100 characters or fewer.';

  return errors;
};
